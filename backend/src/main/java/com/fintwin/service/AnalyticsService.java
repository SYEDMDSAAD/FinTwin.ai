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

        return summarize(transactionRepository.findByUser(user), LocalDate.now());
    }

    /**
     * The dashboard's figures, each over a stated period:
     * <ul>
     *   <li>income, expenses, savings, top category and merchant: the last 3 months
     *       (this month and the two before it);</li>
     *   <li>month*: this calendar month so far;</li>
     *   <li>compared*: the same days of last month (1–20 Oct on 20 Nov), which the
     *       trends are measured against, so a part month isn't set against a whole one;</li>
     *   <li>allTime*: everything on record.</li>
     * </ul>
     * Transfers between the user's own accounts count in none of them.
     */
    static MonthlySummaryDTO summarize(List<Transaction> all, LocalDate today) {

        LocalDate threeMonthsFrom = today.minusMonths(2).withDayOfMonth(1);

        List<Transaction> transactions = all.stream()
                .filter(t -> t.getDate() != null && !t.getDate().isBefore(threeMonthsFrom))
                .toList();

        MonthlySummaryDTO dto = new MonthlySummaryDTO();

        double income   = com.fintwin.util.TransactionMath.income(transactions);
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions);

        double savings = income - expenses;

        LocalDate currentMonthStart  = today.withDayOfMonth(1);
        LocalDate previousMonthStart = currentMonthStart.minusMonths(1);
        LocalDate comparedTo         = sameDayLastMonth(today);

        List<Transaction> thisMonth = between(all, currentMonthStart, null);
        List<Transaction> lastMonthSoFar = between(all, previousMonthStart, comparedTo);

        double currentIncome   = com.fintwin.util.TransactionMath.income(thisMonth);
        double currentExpenses = com.fintwin.util.TransactionMath.expenses(thisMonth);
        double currentSavings  = currentIncome - currentExpenses;

        double previousIncome   = com.fintwin.util.TransactionMath.income(lastMonthSoFar);
        double previousExpenses = com.fintwin.util.TransactionMath.expenses(lastMonthSoFar);
        double previousSavings  = previousIncome - previousExpenses;

        double allTimeIncome   = com.fintwin.util.TransactionMath.income(all);
        double allTimeExpenses = com.fintwin.util.TransactionMath.expenses(all);

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
        dto.setPeriodFrom(threeMonthsFrom);

        dto.setTopCategory(topCategory);
        dto.setTopMerchant(topMerchant);
        dto.setTransactionCount(transactions.size());

        dto.setMonthFrom(currentMonthStart);
        dto.setMonthIncome(currentIncome);
        dto.setMonthExpenses(currentExpenses);
        dto.setMonthSavings(currentSavings);

        dto.setComparedFrom(previousMonthStart);
        dto.setComparedTo(comparedTo);
        dto.setComparedIncome(previousIncome);
        dto.setComparedExpenses(previousExpenses);
        dto.setComparedSavings(previousSavings);

        dto.setIncomeTrend(calculateTrend(currentIncome, previousIncome));
        dto.setExpenseTrend(calculateTrend(currentExpenses, previousExpenses));
        dto.setSavingsTrend(calculateTrend(currentSavings, previousSavings));

        dto.setAllTimeFrom(all.stream()
                .map(Transaction::getDate)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null));
        dto.setAllTimeIncome(allTimeIncome);
        dto.setAllTimeExpenses(allTimeExpenses);
        dto.setAllTimeSavings(allTimeIncome - allTimeExpenses);

        return dto;
    }

    /**
     * The last day of the comparison window: today's day of last month, or the end
     * of last month when it is shorter (31 Mar compares with all of February).
     */
    static LocalDate sameDayLastMonth(LocalDate today) {
        LocalDate lastMonth = today.withDayOfMonth(1).minusMonths(1);
        return lastMonth.withDayOfMonth(Math.min(today.getDayOfMonth(), lastMonth.lengthOfMonth()));
    }

    /** Transactions dated from {@code from} on, and up to {@code to} when it is given. */
    private static List<Transaction> between(List<Transaction> all, LocalDate from, LocalDate to) {
        return all.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return d != null && !d.isBefore(from) && (to == null || !d.isAfter(to));
                })
                .toList();
    }

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
                today.minusMonths(com.fintwin.util.RecurringMath.WINDOW_MONTHS).withDayOfMonth(1));

        return com.fintwin.util.RecurringMath.detectAll(transactions, today).stream()
                .map(AnalyticsService::toDTO)
                .toList();
    }

    private static RecurringExpenseDTO toDTO(com.fintwin.util.RecurringMath.Recurrence r) {
        RecurringExpenseDTO dto = new RecurringExpenseDTO();
        dto.setMerchant(r.merchant());
        dto.setAmount(r.typicalAmount());
        dto.setOccurrences(r.occurrences());
        dto.setCadence(r.cadenceLabel());
        dto.setAnnualisedCost(r.annualisedCost());
        dto.setLastCharged(r.lastCharged());
        dto.setNextChargeDate(r.nextChargeDate());
        dto.setAmountVaries(r.amountVaries());
        dto.setActive(r.active());
        return dto;
    }

    /**
     * Percentage change from the same days of last month. Divides by the size of that figure, so
     * savings that go from -₹6,550 to +₹13,804 show as a rise, not a -312% fall.
     */
    static double calculateTrend(
            double current,
            double previous
    ) {

        if (previous == 0) {
            return 0;
        }

        return Math.round(

                ((current - previous)
                        / Math.abs(previous))

                        * 1000

        ) / 10.0;
    }
}