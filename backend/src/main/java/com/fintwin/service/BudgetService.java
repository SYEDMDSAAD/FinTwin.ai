package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.exception.ConflictException;
import com.fintwin.exception.ForbiddenException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.dto.BudgetStatusDTO;
import com.fintwin.model.Budget;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
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

    @PreAuthorize("hasAuthority('WRITE_OWN_BUDGETS')")
    @Audited(action = "WRITE", resource = "budgets", description = "Budget category created")
    public Budget createBudget(Budget budget) {

        // Prevent mass-assignment via a client-supplied id (would merge, not insert).
        budget.setId(null);

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
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
            throw new ConflictException(
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

    @PreAuthorize("hasAuthority('WRITE_OWN_BUDGETS')")
    @Audited(action = "DELETE", resource = "budgets", description = "Budget category deleted")
    public void deleteBudget(Long id) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        Budget budget = budgetRepository
                .findById(id)
                .orElseThrow(() ->
                        new NotFoundException("Budget not found")
                );

        // FIXED: Long.equals can have boxing issues — use longValue()
        if (budget.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new ForbiddenException(
                    "Unauthorized Budget Access"
            );
        }

        budgetRepository.delete(budget);
        profileService.saveScoreSnapshot(user);
    }

    // =========================
    // BUDGET STATUS
    // Budget limits are monthly (the universal convention), so spend is
    // measured against the current calendar month only. Previously the
    // full 3-month window was summed against the limit, which made every
    // monthly budget read as ~3x spent and permanently "exceeded" — also
    // wrongly dragging down the Budget Discipline score factor.
    // =========================

    @PreAuthorize("hasAuthority('READ_OWN_BUDGETS')")
    @Audited(action = "READ", resource = "budgets", description = "Budget status retrieved")
    public List<BudgetStatusDTO> getBudgetStatus() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        return getBudgetStatusFor(user);
    }

    // Internal, user-parameterized variant — used by FinancialScoreService so
    // score snapshots can be computed for a known user without going through
    // the request-scoped security context.
    public List<BudgetStatusDTO> getBudgetStatusFor(User user) {

        List<Budget> budgets = budgetRepository.findByUser(user);

        java.time.YearMonth currentMonth = java.time.YearMonth.now();
        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId())
                        .stream()
                        .filter(t -> t.getDate() != null
                                && java.time.YearMonth.from(t.getDate()).equals(currentMonth))
                        .toList();

        List<BudgetStatusDTO> result = new ArrayList<>();

        for (Budget budget : budgets) {

            // Case-insensitive category matching. Exact BigDecimal sum so
            // "spent" and "remaining" are correct to the cent.
            BigDecimal limit = nz(budget.getLimitAmountExact());
            BigDecimal spent = transactions.stream()
                    .filter(t ->
                            t.getAmountExact() != null
                            && t.getAmountExact().signum() < 0
                            && t.getCategory() != null
                            && t.getCategory().equalsIgnoreCase(
                                    budget.getCategory()
                               )
                    )
                    .map(t -> t.getAmountExact().abs())
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            BigDecimal remaining = limit.subtract(spent);
            boolean exceeded = spent.compareTo(limit) > 0;

            result.add(new BudgetStatusDTO(
                    budget.getId(),
                    budget.getCategory(),
                    money(limit),
                    money(spent),
                    money(remaining),
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

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    // Money to the JSON edge: round to 2dp (half-up) and hand the frontend a double.
    private static double money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
