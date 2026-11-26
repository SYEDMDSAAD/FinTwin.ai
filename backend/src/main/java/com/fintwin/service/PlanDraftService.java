package com.fintwin.service;

import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Budget;
import com.fintwin.model.User;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.PlanDraftMath;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * Drafts a plan from the user's transactions ({@link PlanDraftMath}) and, once
 * the user approves it, saves the budgets they kept. Nothing is changed
 * without that approval.
 */
@Service
public class PlanDraftService {

    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");
    static final int MAX_LINES = 30;
    static final double MAX_LIMIT = 10_000_000;

    public record ApprovedLine(String category, Double limit) {}

    /** What applying changed. */
    public record Applied(int created, int updated, int unchanged) {}

    private final UserRepository users;
    private final TransactionRepository transactions;
    private final BudgetRepository budgets;
    private final ProfileService profiles;

    public PlanDraftService(UserRepository users, TransactionRepository transactions,
                            BudgetRepository budgets, ProfileService profiles) {
        this.users = users;
        this.transactions = transactions;
        this.budgets = budgets;
        this.profiles = profiles;
    }

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    @Transactional(readOnly = true)
    public PlanDraftMath.Draft draft() {
        return draftFor(currentUser(), LocalDate.now(INDIA));
    }

    PlanDraftMath.Draft draftFor(User user, LocalDate today) {
        var recent = transactions.findSince(user.getId(), today.minusMonths(5).withDayOfMonth(1));
        Map<String, Double> limits = new HashMap<>();
        for (Budget b : budgets.findByUser(user)) {
            if (b.getCategory() != null && b.getLimitAmount() != null) limits.put(b.getCategory(), b.getLimitAmount());
        }
        return PlanDraftMath.draft(recent, limits, today);
    }

    /** Saves the approved lines: a new budget per new category, a new limit for an existing one. */
    @PreAuthorize("hasAuthority('WRITE_OWN_BUDGETS')")
    @Transactional
    public Applied apply(List<ApprovedLine> lines) {
        if (lines == null || lines.isEmpty()) throw new IllegalArgumentException("Nothing to save");
        if (lines.size() > MAX_LINES) throw new IllegalArgumentException("Too many budgets at once");
        User user = currentUser();

        Map<String, Budget> existing = new HashMap<>();
        for (Budget b : budgets.findByUser(user)) {
            if (b.getCategory() != null) existing.put(b.getCategory().toLowerCase(Locale.ROOT), b);
        }
        int created = 0, updated = 0, unchanged = 0;
        Set<String> seen = new HashSet<>();
        List<Budget> toSave = new ArrayList<>();
        for (ApprovedLine line : lines) {
            String category = line.category() == null ? "" : line.category().trim();
            if (category.isEmpty() || category.length() > 40) throw new IllegalArgumentException("Each budget needs a category");
            if (line.limit() == null || !(line.limit() > 0) || line.limit() > MAX_LIMIT) {
                throw new IllegalArgumentException("Budget limit for " + category + " must be above 0");
            }
            String key = category.toLowerCase(Locale.ROOT);
            if (!seen.add(key)) throw new IllegalArgumentException(category + " appears twice");
            double limit = Math.round(line.limit() * 100) / 100.0;

            Budget b = existing.get(key);
            if (b == null) {
                b = new Budget();
                b.setCategory(Character.toUpperCase(category.charAt(0)) + category.substring(1));
                b.setUser(user);
                created++;
            } else if (b.getLimitAmount() != null && Math.abs(b.getLimitAmount() - limit) < 0.005) {
                unchanged++;
                continue;
            } else {
                updated++;
            }
            b.setLimitAmount(limit);
            toSave.add(b);
        }
        if (!toSave.isEmpty()) {
            budgets.saveAll(toSave);
            profiles.saveScoreSnapshot(user);
        }
        return new Applied(created, updated, unchanged);
    }

    private User currentUser() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
    }
}
