package com.fintwin.service;

import com.fintwin.dto.CreditScoreDTO;
import com.fintwin.dto.CreditScoreDTO.FactorDTO;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Liability;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.LiabilityRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * FinTwin's internal Debt &amp; Discipline Score (300–900), computed from the
 * user's transaction history and liabilities.
 *
 * This is NOT a credit-bureau score. Bureaus (CIBIL/Experian/Equifax) score
 * payment history, credit utilization, account age, credit mix, and hard
 * inquiries — none of which are visible to this app. The 300–900 range is
 * kept only because it's the scale Indian users know how to read; the DTO
 * carries a disclaimer the frontend must display.
 *
 * Factors and weights:
 *   Savings Discipline            35% → max 210 pts
 *   Debt-to-Income Ratio          30% → max 180 pts
 *   Spending Consistency          15% → max  90 pts
 *   Income Regularity             10% → max  60 pts
 *   Category Health               10% → max  60 pts
 *
 * Base: 300  |  Max additive: 600  |  Range: 300–900
 */
@Service
public class CreditScoreService {

    @Autowired private TransactionRepository transactionRepository;
    @Autowired private LiabilityRepository   liabilityRepository;
    @Autowired private UserRepository        userRepository;

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    public CreditScoreDTO calculate() {

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        List<Transaction> txns = transactionRepository.findLatestThreeMonthsTransactions(user.getId());
        List<Liability>   liabilities = liabilityRepository.findByUser(user);

        double income   = txns.stream().filter(t -> t.getAmount() != null && t.getAmount() > 0)
                              .mapToDouble(Transaction::getAmount).sum();
        double expenses = txns.stream().filter(t -> t.getAmount() != null && t.getAmount() < 0)
                              .mapToDouble(t -> Math.abs(t.getAmount())).sum();
        double totalDebt = liabilities.stream()
                .map(Liability::getAmount)
                .filter(a -> a != null)
                .mapToDouble(Double::doubleValue).sum();

        // ── 1. Savings Discipline (max 210 pts) ───────────────────────────
        double savingsRate = income > 0 ? (income - expenses) / income * 100 : 0;
        int savingsPts;
        String savingsStatus, savingsDesc;
        if (savingsRate >= 40) {
            savingsPts = 210; savingsStatus = "good";
            savingsDesc = "Exceptional savings rate of " + fmt(savingsRate) + "% — top tier financial discipline.";
        } else if (savingsRate >= 30) {
            savingsPts = 175; savingsStatus = "good";
            savingsDesc = "Strong savings rate of " + fmt(savingsRate) + "%. Consistently above the 20% benchmark.";
        } else if (savingsRate >= 20) {
            savingsPts = 140; savingsStatus = "good";
            savingsDesc = "Healthy savings rate of " + fmt(savingsRate) + "%. Meeting the recommended minimum.";
        } else if (savingsRate >= 10) {
            savingsPts = 90; savingsStatus = "warning";
            savingsDesc = "Savings rate of " + fmt(savingsRate) + "% is below the 20% benchmark. Room to improve.";
        } else if (savingsRate >= 0) {
            savingsPts = 40; savingsStatus = "warning";
            savingsDesc = "Very low savings rate of " + fmt(savingsRate) + "%. Prioritise cutting discretionary spend.";
        } else {
            savingsPts = 0; savingsStatus = "poor";
            savingsDesc = "Spending exceeds income. This significantly impacts your score.";
        }

        // ── 2. Debt-to-Income Ratio (max 180 pts) ─────────────────────────
        // Real DTI is monthly debt *payments* / monthly income — that's what
        // lenders underwrite against. When liabilities carry an EMI we use it;
        // otherwise fall back to a balance/annual-income leverage ratio with
        // thresholds calibrated for balances (a normal car loan ≈ 40% of
        // annual income and a mortgage 200-400% — neither should score zero,
        // which the old payment-style thresholds did).
        int months = com.fintwin.util.TransactionMath.monthsPresent(txns);
        double monthlyIncome = income / months;
        double annualIncome  = monthlyIncome * 12;
        double totalEmi = liabilities.stream()
                .map(Liability::getEmi)
                .filter(e -> e != null && e > 0)
                .mapToDouble(Double::doubleValue).sum();

        int debtPts;
        String debtStatus, debtDesc;
        if (totalDebt == 0) {
            debtPts = 180; debtStatus = "good";
            debtDesc = "No outstanding liabilities. Excellent debt position.";
        } else if (totalEmi > 0 && monthlyIncome > 0) {
            // Payment-based DTI — standard lending thresholds
            double dti = totalEmi / monthlyIncome * 100;
            if (dti < 20) {
                debtPts = 160; debtStatus = "good";
                debtDesc = "Debt payments are " + fmt(dti) + "% of monthly income — comfortably within safe limits.";
            } else if (dti < 36) {
                debtPts = 130; debtStatus = "good";
                debtDesc = "Payment-to-income ratio of " + fmt(dti) + "% is manageable. Lenders consider under 36% healthy.";
            } else if (dti < 43) {
                debtPts = 90; debtStatus = "warning";
                debtDesc = "Payment-to-income ratio of " + fmt(dti) + "% is elevated — above 36%, lenders start seeing risk.";
            } else if (dti < 50) {
                debtPts = 45; debtStatus = "warning";
                debtDesc = "High payment burden of " + fmt(dti) + "% of income. New credit will be hard to service.";
            } else {
                debtPts = 0; debtStatus = "poor";
                debtDesc = "Debt payments consume " + fmt(dti) + "% of income — a critical level. Prioritise repayment.";
            }
        } else {
            // No EMI data — leverage ratio (balance vs annual income)
            double leverage = annualIncome > 0 ? (totalDebt / annualIncome) * 100 : 100;
            if (leverage < 35) {
                debtPts = 160; debtStatus = "good";
                debtDesc = "Total debt is " + fmt(leverage) + "% of annual income — a light debt load.";
            } else if (leverage < 100) {
                debtPts = 130; debtStatus = "good";
                debtDesc = "Total debt at " + fmt(leverage) + "% of annual income is normal for a financed vehicle or education loan.";
            } else if (leverage < 250) {
                debtPts = 90; debtStatus = "warning";
                debtDesc = "Total debt is " + fmt(leverage) + "% of annual income — typical with a mortgage; add EMI details for a more accurate reading.";
            } else if (leverage < 400) {
                debtPts = 45; debtStatus = "warning";
                debtDesc = "Debt of " + fmt(leverage) + "% of annual income is on the high side. Add EMI details to your liabilities for a payment-based assessment.";
            } else {
                debtPts = 0; debtStatus = "poor";
                debtDesc = "Debt exceeds 4x annual income. Prioritise repayment planning.";
            }
        }

        // ── 3. Spending Consistency (max 90 pts) ──────────────────────────
        // Group monthly expenses and calculate coefficient of variation
        Map<String, Double> byMonth = txns.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0 && t.getDate() != null)
                .collect(Collectors.groupingBy(
                        t -> t.getDate().toString().substring(0, 7),
                        Collectors.summingDouble(t -> Math.abs(t.getAmount()))
                ));
        int consistencyPts;
        String consistencyStatus, consistencyDesc;
        if (byMonth.size() < 2) {
            consistencyPts = 60; consistencyStatus = "neutral";
            consistencyDesc = "Not enough monthly data to assess spending consistency yet.";
        } else {
            double mean = byMonth.values().stream().mapToDouble(d -> d).average().orElse(0);
            double variance = byMonth.values().stream()
                    .mapToDouble(d -> Math.pow(d - mean, 2)).average().orElse(0);
            double cv = mean > 0 ? Math.sqrt(variance) / mean * 100 : 100;
            if (cv < 10) {
                consistencyPts = 90; consistencyStatus = "good";
                consistencyDesc = "Very stable monthly spending pattern — low volatility signals financial control.";
            } else if (cv < 25) {
                consistencyPts = 70; consistencyStatus = "good";
                consistencyDesc = "Reasonably consistent spending across months with minor fluctuations.";
            } else if (cv < 50) {
                consistencyPts = 45; consistencyStatus = "warning";
                consistencyDesc = "Noticeable month-to-month spending swings. Try to smooth irregular expenses.";
            } else {
                consistencyPts = 15; consistencyStatus = "poor";
                consistencyDesc = "High spending volatility detected. Erratic patterns reduce your score.";
            }
        }

        // ── 4. Income Regularity (max 60 pts) ─────────────────────────────
        Map<String, Long> incomeByMonth = txns.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0 && t.getDate() != null)
                .collect(Collectors.groupingBy(
                        t -> t.getDate().toString().substring(0, 7),
                        Collectors.counting()
                ));
        int incomePts;
        String incomeStatus, incomeDesc;
        if (incomeByMonth.size() >= 3) {
            incomePts = 60; incomeStatus = "good";
            incomeDesc = "Income recorded across all 3 months. Consistent earnings boost your score.";
        } else if (incomeByMonth.size() == 2) {
            incomePts = 40; incomeStatus = "warning";
            incomeDesc = "Income visible in 2 of the last 3 months. Ensure transactions are up to date.";
        } else if (incomeByMonth.size() == 1) {
            incomePts = 20; incomeStatus = "warning";
            incomeDesc = "Income only recorded in 1 month. Add more transaction data to improve this factor.";
        } else {
            incomePts = 0; incomeStatus = "poor";
            incomeDesc = "No income transactions found in the last 3 months. Score heavily penalised.";
        }

        // ── 5. Category Health (max 60 pts) ───────────────────────────────
        Map<String, Double> catTotals = txns.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0 && t.getCategory() != null)
                .collect(Collectors.groupingBy(
                        Transaction::getCategory,
                        Collectors.summingDouble(t -> Math.abs(t.getAmount()))
                ));
        long overCategories = catTotals.entrySet().stream()
                .filter(e -> income > 0 && (e.getValue() / income) > 0.30)
                .count();
        int categoryPts;
        String categoryStatus, categoryDesc;
        if (overCategories == 0) {
            categoryPts = 60; categoryStatus = "good";
            categoryDesc = "No spending category exceeds 30% of income. Well-balanced expenditure.";
        } else if (overCategories == 1) {
            categoryPts = 30; categoryStatus = "warning";
            categoryDesc = overCategories + " category exceeds 30% of income. Review and set a cap for it.";
        } else {
            categoryPts = 0; categoryStatus = "poor";
            categoryDesc = overCategories + " categories each exceed 30% of income. Significant rebalancing needed.";
        }

        // ── Final Score ───────────────────────────────────────────────────
        int total = 300 + savingsPts + debtPts + consistencyPts + incomePts + categoryPts;
        total = Math.max(300, Math.min(900, total));

        String band, bandColor;
        if      (total >= 800) { band = "Excellent"; bandColor = "#a78bfa"; }
        else if (total >= 750) { band = "Very Good";  bandColor = "#22d3ee"; }
        else if (total >= 650) { band = "Good";       bandColor = "#4ade80"; }
        else if (total >= 550) { band = "Fair";       bandColor = "#fbbf24"; }
        else                   { band = "Poor";       bandColor = "#f87171"; }

        List<FactorDTO> factors = List.of(
            new FactorDTO("Savings Discipline",  "High",   savingsPts,     210, savingsStatus,     savingsDesc),
            new FactorDTO("Debt-to-Income",       "High",   debtPts,        180, debtStatus,        debtDesc),
            new FactorDTO("Spending Consistency", "Medium", consistencyPts,  90, consistencyStatus, consistencyDesc),
            new FactorDTO("Income Regularity",    "Medium", incomePts,       60, incomeStatus,      incomeDesc),
            new FactorDTO("Category Health",      "Low",    categoryPts,     60, categoryStatus,    categoryDesc)
        );

        return new CreditScoreDTO(total, band, bandColor, factors,
                "This is FinTwin's internal estimate based on your transactions and "
                + "liabilities. It is not a credit bureau score — your actual "
                + "CIBIL/Experian score depends on payment history, credit utilisation "
                + "and other data this app cannot see.");
    }

    private String fmt(double v) {
        return String.valueOf(Math.round(v * 10) / 10.0);
    }
}
