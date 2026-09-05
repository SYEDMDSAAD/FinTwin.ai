package com.fintwin.service;

import com.fintwin.dto.MonthlySummaryDTO;
import com.fintwin.model.Transaction;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.dto.RecurringExpenseDTO;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import com.fintwin.audit.Audited;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.prepost.PreAuthorize;

import java.time.LocalDate;

import java.util.*;
import java.util.stream.Collectors;

@Service
public class AnalyticsService {

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private UserRepository userRepository;

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    @Audited(action = "READ", resource = "analytics", description = "User viewed monthly financial summary")
    public MonthlySummaryDTO getMonthlySummary() {

        String email =
                SecurityUtils.getCurrentUserEmail();

        User user =
                userRepository
                        .findByEmail(email)
                        .orElseThrow();

        List<Transaction> transactions =
            transactionRepository.findLatestThreeMonthsTransactions(user.getId());

        LocalDate cutoffDate =
                LocalDate.now()
                        .minusMonths(2)
                        .withDayOfMonth(1);

        transactions = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return d != null && !d.isBefore(cutoffDate);
                })
                .toList();

        MonthlySummaryDTO dto = new MonthlySummaryDTO();

        double income   = com.fintwin.util.TransactionMath.income(transactions);
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions);

        double savings = income - expenses;

        LocalDate currentMonthStart  = LocalDate.now().withDayOfMonth(1);
        LocalDate previousMonthStart = currentMonthStart.minusMonths(1);
        LocalDate previousMonthEnd   = currentMonthStart.minusDays(1);

        double currentIncome = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return !com.fintwin.util.TransactionMath.isSelfTransfer(t)
                            && t.getAmount() != null && t.getAmount() > 0
                            && d != null && !d.isBefore(currentMonthStart);
                })
                .mapToDouble(Transaction::getAmount)
                .sum();

        double currentExpenses = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return !com.fintwin.util.TransactionMath.isSelfTransfer(t)
                            && t.getAmount() != null && t.getAmount() < 0
                            && d != null && !d.isBefore(currentMonthStart);
                })
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double currentSavings = currentIncome - currentExpenses;

        double previousIncome = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return !com.fintwin.util.TransactionMath.isSelfTransfer(t)
                            && t.getAmount() != null && t.getAmount() > 0
                            && d != null && !d.isBefore(previousMonthStart) && !d.isAfter(previousMonthEnd);
                })
                .mapToDouble(Transaction::getAmount)
                .sum();

        double previousExpenses = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return !com.fintwin.util.TransactionMath.isSelfTransfer(t)
                            && t.getAmount() != null && t.getAmount() < 0
                            && d != null && !d.isBefore(previousMonthStart) && !d.isAfter(previousMonthEnd);
                })
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double previousSavings =
                previousIncome -
                previousExpenses;                    

        // =========================
        // Top Category
        // =========================

        String topCategory = transactions.stream()
                .filter(t -> t.getCategory() != null)
                .collect(Collectors.groupingBy(Transaction::getCategory, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("None");

        String topMerchant = transactions.stream()
                .filter(t -> t.getMerchant() != null)
                .collect(Collectors.groupingBy(Transaction::getMerchant, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("None");

        // =========================
        // DTO
        // =========================

        dto.setIncome(income);

        dto.setExpenses(expenses);

        dto.setSavings(savings);

        dto.setTopCategory(topCategory);

        dto.setTopMerchant(topMerchant);

        dto.setTransactionCount(
            transactions.size()
        );

        dto.setIncomeTrend(

                calculateTrend(
                        currentIncome,
                        previousIncome
                )
        );

        dto.setExpenseTrend(

                calculateTrend(
                        currentExpenses,
                        previousExpenses
                )
        );

        dto.setSavingsTrend(

                calculateTrend(
                        currentSavings,
                        previousSavings
                )
        );

        return dto;
    }

    /**
     * How far back recurring detection looks. A year plus a month: long enough
     * to see an annual subscription bill twice at the edges, and to give a
     * quarterly one four data points.
     */
    private static final int RECURRING_WINDOW_MONTHS = 13;

    /** Charges below this are noise — a ₹10 repeat is not worth surfacing. */
    private static final double RECURRING_MIN_AMOUNT = 20.0;

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    @Audited(action = "READ", resource = "analytics", description = "User viewed recurring expense analysis")
    public List<RecurringExpenseDTO>
    getRecurringExpenses() {

        String email =
                SecurityUtils.getCurrentUserEmail();

        User user =
                userRepository
                        .findByEmail(email)
                        .orElseThrow();

        LocalDate today = LocalDate.now();

        List<Transaction> transactions = transactionRepository.findSince(
                user.getId(),
                today.minusMonths(RECURRING_WINDOW_MONTHS).withDayOfMonth(1));

        // Group spending by normalized merchant so the same subscription billed
        // as "NETFLIX*IN 4417" and "UPI-NETFLIX COM" lands in one bucket instead
        // of two that are each too small to detect.
        Map<String, List<Transaction>> grouped = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .filter(t -> Math.abs(t.getAmount()) >= RECURRING_MIN_AMOUNT)
                .filter(t -> t.getMerchant() != null)
                // Card bill payments repeat monthly and would otherwise be
                // reported as the largest "subscription" a user has — they are
                // the repayment of spending already listed, not a charge.
                .filter(t -> !com.fintwin.util.TransactionMath.isSelfTransfer(t))
                .collect(Collectors.groupingBy(
                        t -> com.fintwin.util.RecurringMath.normalizeMerchant(t.getMerchant())));

        List<RecurringExpenseDTO> result = new ArrayList<>();

        for (Map.Entry<String, List<Transaction>> entry : grouped.entrySet()) {

            com.fintwin.util.RecurringMath.Recurrence r =
                    com.fintwin.util.RecurringMath.detect(entry.getKey(), entry.getValue(), today);

            if (r == null) continue;

            RecurringExpenseDTO dto = new RecurringExpenseDTO();
            // Show the merchant as the bank wrote it most recently — the
            // normalized key is a grouping device, not something to read.
            dto.setMerchant(displayName(entry.getValue()));
            dto.setAmount(r.typicalAmount());
            dto.setOccurrences(r.occurrences());
            dto.setCadence(r.cadenceLabel());
            dto.setAnnualisedCost(r.annualisedCost());
            dto.setLastCharged(r.lastCharged());
            dto.setNextChargeDate(r.nextChargeDate());
            dto.setAmountVaries(r.amountVaries());
            dto.setActive(r.active());

            result.add(dto);
        }

        // Costliest per year first — that is the order someone cancelling reads in.
        result.sort(Comparator
                .comparing(RecurringExpenseDTO::isActive).reversed()
                .thenComparing(Comparator.comparingDouble(RecurringExpenseDTO::getAnnualisedCost).reversed()));

        return result;
    }

    /** The most recent raw merchant string in a group. */
    private static String displayName(List<Transaction> group) {
        return group.stream()
                .filter(t -> t.getDate() != null)
                .max(Comparator.comparing(Transaction::getDate))
                .map(Transaction::getMerchant)
                .orElseGet(() -> group.get(0).getMerchant());
    }

    private static String toYearMonth(LocalDate d) {
        return d != null ? d.toString().substring(0, 7) : "unknown";
    }

    private double calculateTrend(
            double current,
            double previous
    ) {

        if (previous == 0) {
            return 0;
        }

        return Math.round(

                ((current - previous)
                        / previous)

                        * 1000

        ) / 10.0;
    }
}