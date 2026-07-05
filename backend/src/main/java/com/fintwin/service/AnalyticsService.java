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

        double income = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount)
                .sum();

        double expenses = Math.abs(transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .mapToDouble(Transaction::getAmount)
                .sum());

        double savings = income - expenses;

        LocalDate currentMonthStart  = LocalDate.now().withDayOfMonth(1);
        LocalDate previousMonthStart = currentMonthStart.minusMonths(1);
        LocalDate previousMonthEnd   = currentMonthStart.minusDays(1);

        double currentIncome = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return t.getAmount() != null && t.getAmount() > 0
                            && d != null && !d.isBefore(currentMonthStart);
                })
                .mapToDouble(Transaction::getAmount)
                .sum();

        double currentExpenses = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return t.getAmount() != null && t.getAmount() < 0
                            && d != null && !d.isBefore(currentMonthStart);
                })
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double currentSavings = currentIncome - currentExpenses;

        double previousIncome = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return t.getAmount() != null && t.getAmount() > 0
                            && d != null && !d.isBefore(previousMonthStart) && !d.isAfter(previousMonthEnd);
                })
                .mapToDouble(Transaction::getAmount)
                .sum();

        double previousExpenses = transactions.stream()
                .filter(t -> {
                    LocalDate d = t.getDate();
                    return t.getAmount() != null && t.getAmount() < 0
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

        Map<String, List<Transaction>> grouped = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .filter(t -> t.getMerchant() != null)  // groupingBy throws on null keys
                .collect(Collectors.groupingBy(Transaction::getMerchant));

        List<RecurringExpenseDTO> result =
            new ArrayList<>();

        for (
            Map.Entry<String,
            List<Transaction>> entry
            : grouped.entrySet()
        ) {

            List<Transaction> txns =
                    entry.getValue();

            long distinctMonths = txns.stream()
                    .map(t -> toYearMonth(t.getDate()))
                    .filter(m -> !m.equals("unknown"))
                    .distinct()
                    .count();

            if (distinctMonths >= 3)
            {

                RecurringExpenseDTO dto =
                    new RecurringExpenseDTO();

                dto.setMerchant(
                    entry.getKey()
                );

                dto.setOccurrences(
                    entry.getValue().size()
                );

                dto.setAmount(

                    Math.abs(

                        entry.getValue()
                            .get(0)
                            .getAmount()
                    )
                );

                result.add(dto);
            }
        }
        result.sort(

            Comparator.comparing(
                RecurringExpenseDTO::getAmount
            ).reversed()

        );

        return result;
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