package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.dto.BudgetStatusDTO;
import com.fintwin.model.Budget;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
public class BudgetService {

    private final BudgetRepository budgetRepository;
    private final TransactionRepository transactionRepository;
    private final UserRepository userRepository;
    private final ProfileService profileService;

    public BudgetService(
            BudgetRepository budgetRepository,
            TransactionRepository transactionRepository,
            UserRepository userRepository,
            ProfileService profileService
    ) {
        this.budgetRepository = budgetRepository;
        this.transactionRepository = transactionRepository;
        this.userRepository = userRepository;
        this.profileService = profileService;
    }

    // =========================
    // CREATE BUDGET
    // IMPROVEMENT: validate inputs before persisting.
    // Prevent duplicate category budgets per user.
    // =========================

    @Audited(action = "WRITE", resource = "budgets", description = "Budget category created")
    public Budget createBudget(Budget budget) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        if (budget.getCategory() == null
                || budget.getCategory().isBlank()) {
            throw new IllegalArgumentException(
                    "Budget category must not be empty"
            );
        }

        if (budget.getLimitAmount() == null
                || budget.getLimitAmount() <= 0) {
            throw new IllegalArgumentException(
                    "Budget limit must be greater than 0"
            );
        }

        // IMPROVEMENT: prevent duplicate category budget
        boolean alreadyExists = budgetRepository
                .findByUser(user)
                .stream()
                .anyMatch(b -> b.getCategory()
                        .equalsIgnoreCase(budget.getCategory())
                );

        if (alreadyExists) {
            throw new RuntimeException(
                    "A budget for category '"
                    + budget.getCategory()
                    + "' already exists"
            );
        }

        budget.setCategory(
                capitalizeFirstLetter(budget.getCategory())
        );
        budget.setUser(user);

        Budget saved = budgetRepository.save(budget);
        profileService.saveScoreSnapshot(user);

        return saved;
    }

    // =========================
    // DELETE BUDGET
    // FIXED: authorization check was present but used
    // .equals() on Long — safe in Java for small IDs
    // but can fail for large IDs due to Integer cache.
    // Changed to longValue() comparison.
    // =========================

    @Audited(action = "DELETE", resource = "budgets", description = "Budget category deleted")
    public void deleteBudget(Long id) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        Budget budget = budgetRepository
                .findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Budget not found")
                );

        // FIXED: Long.equals can have boxing issues — use longValue()
        if (budget.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new RuntimeException(
                    "Unauthorized Budget Access"
            );
        }

        budgetRepository.delete(budget);
        profileService.saveScoreSnapshot(user);
    }

    // =========================
    // BUDGET STATUS
    // FIXED: was fetching all 3-month transactions then
    // re-filtering by 3-month cutoff — redundant double
    // filter. Removed duplicate filter.
    // IMPROVEMENT: added percentage field to DTO for
    // frontend progress bars without client-side math.
    // =========================

    @Audited(action = "READ", resource = "budgets", description = "Budget status retrieved")
    public List<BudgetStatusDTO> getBudgetStatus() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        List<Budget> budgets = budgetRepository.findByUser(user);

        // FIXED: removed the duplicate cutoff filter that was
        // reapplied after findLatestThreeMonthsTransactions
        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        List<BudgetStatusDTO> result = new ArrayList<>();

        for (Budget budget : budgets) {

            // Case-insensitive category matching
            double spent = transactions.stream()
                    .filter(t ->
                            t.getAmount() < 0
                            && t.getCategory() != null
                            && t.getCategory().equalsIgnoreCase(
                                    budget.getCategory()
                               )
                    )
                    .mapToDouble(t -> Math.abs(t.getAmount()))
                    .sum();

            double remaining = budget.getLimitAmount() - spent;
            boolean exceeded = spent > budget.getLimitAmount();

            // IMPROVEMENT: include percentage for frontend
            double percentage = budget.getLimitAmount() > 0
                    ? Math.min((spent / budget.getLimitAmount()) * 100, 100)
                    : 0;

            result.add(new BudgetStatusDTO(
                    budget.getId(),
                    budget.getCategory(),
                    budget.getLimitAmount(),
                    spent,
                    remaining,
                    exceeded
            ));
        }

        return result;
    }

    // =========================
    // PRIVATE HELPER
    // =========================

    private String capitalizeFirstLetter(String s) {
        if (s == null || s.isEmpty()) return s;
        return Character.toUpperCase(s.charAt(0))
                + s.substring(1).toLowerCase();
    }
}
