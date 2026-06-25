package com.fintwin.service;

import com.fintwin.dto.ProfileDTO;
import com.fintwin.dto.ChangePasswordDTO;
import com.fintwin.dto.UpdateProfileDTO;
import com.fintwin.model.User;
import com.fintwin.model.Transaction;
import com.fintwin.model.FinancialScoreHistory;
import com.fintwin.audit.Audited;
import com.fintwin.model.Asset;
import com.fintwin.model.Liability;
import com.fintwin.repository.*;
import com.fintwin.security.PasswordValidator;
import com.fintwin.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@Transactional
public class ProfileService {

    @Autowired private AssetRepository assetRepository;
    @Autowired private LiabilityRepository liabilityRepository;

    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final FinancialGoalRepository goalRepository;
    private final PasswordEncoder passwordEncoder;
    private final ChatHistoryRepository chatHistoryRepository;
    private final BudgetRepository budgetRepository;
    private final FinancialScoreHistoryRepository financialScoreHistoryRepository;
    private final BankConnectionRepository bankConnectionRepository;

    public ProfileService(
            UserRepository userRepository,
            TransactionRepository transactionRepository,
            FinancialGoalRepository goalRepository,
            PasswordEncoder passwordEncoder,
            ChatHistoryRepository chatHistoryRepository,
            BudgetRepository budgetRepository,
            FinancialScoreHistoryRepository financialScoreHistoryRepository,
            BankConnectionRepository bankConnectionRepository
    ) {
        this.userRepository = userRepository;
        this.transactionRepository = transactionRepository;
        this.goalRepository = goalRepository;
        this.passwordEncoder = passwordEncoder;
        this.chatHistoryRepository = chatHistoryRepository;
        this.budgetRepository = budgetRepository;
        this.financialScoreHistoryRepository = financialScoreHistoryRepository;
        this.bankConnectionRepository = bankConnectionRepository;
    }

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    @Audited(action = "READ", resource = "profile", description = "User profile retrieved")
    public ProfileDTO getProfile() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        long transactionCount = transactionRepository.countByUser(user);
        long goalCount        = goalRepository.countByUser(user);
        int score             = calculateFinancialScore(user);

        return new ProfileDTO(
                user.getFullName(),
                user.getEmail(),
                user.getCreatedAt().toLocalDate().toString(),
                transactionCount,
                goalCount,
                score
        );
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_PROFILE')")
    @Audited(action = "WRITE", resource = "auth", description = "User changed password")
    public String changePassword(ChangePasswordDTO dto) {

        if (dto.getCurrentPassword() == null || dto.getNewPassword() == null)
            throw new IllegalArgumentException("Current and new passwords are required.");
        PasswordValidator.validate(dto.getNewPassword());

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        if (!passwordEncoder.matches(
                dto.getCurrentPassword(), user.getPassword())) {
            throw new RuntimeException("Current password is incorrect");
        }

        user.setPassword(
                passwordEncoder.encode(dto.getNewPassword())
        );
        userRepository.save(user);

        return "Password updated successfully";
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_PROFILE')")
    @Audited(action = "WRITE", resource = "profile", description = "User profile updated")
    public String updateProfile(UpdateProfileDTO dto) {

        if (dto.getFullName() == null || dto.getFullName().isBlank()) {
            throw new IllegalArgumentException(
                    "Full name must not be empty"
            );
        }

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        user.setFullName(dto.getFullName().trim());
        userRepository.save(user);

        return "Profile updated successfully";
    }

    @PreAuthorize("hasAuthority('DELETE_OWN_ACCOUNT')")
    @Audited(action = "DELETE", resource = "account", description = "User account and all data permanently deleted")
    @Transactional
    public String deleteAccount() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        // explicit delete order to respect FK constraints
        chatHistoryRepository.deleteByUser(user);
        transactionRepository.deleteByUser(user);
        goalRepository.deleteByUser(user);
        budgetRepository.deleteByUser(user);
        assetRepository.deleteByUser(user);
        liabilityRepository.deleteByUser(user);
        financialScoreHistoryRepository.deleteByUser(user);
        bankConnectionRepository.deleteByUser(user);
        userRepository.delete(user);

        return "Account deleted successfully";
    }

    @PreAuthorize("hasAuthority('EXPORT_OWN_DATA')")
    @Audited(action = "EXPORT", resource = "account", description = "User exported personal data (GDPR portability)")
    public Map<String, Object> exportData() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("exportedAt", java.time.LocalDateTime.now().toString());
        export.put("profile", Map.of(
                "fullName",         user.getFullName(),
                "email",            user.getEmail(),
                "createdAt",        user.getCreatedAt(),
                "twoFactorEnabled", Boolean.TRUE.equals(user.getTwoFactorEnabled()),
                "consentGivenAt",   user.getConsentGivenAt()
        ));
        export.put("transactions",   transactionRepository.findByUser(user));
        export.put("goals",          goalRepository.findByUser(user));
        export.put("budgets",        budgetRepository.findByUser(user));
        export.put("assets",         assetRepository.findByUser(user));
        export.put("liabilities",    liabilityRepository.findByUser(user));
        export.put("scoreHistory",   financialScoreHistoryRepository.findByUserOrderByMonthAsc(user));
        return export;
    }

    @Transactional
    public void deleteUserById(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        chatHistoryRepository.deleteByUser(user);
        transactionRepository.deleteByUser(user);
        goalRepository.deleteByUser(user);
        budgetRepository.deleteByUser(user);
        assetRepository.deleteByUser(user);
        liabilityRepository.deleteByUser(user);
        financialScoreHistoryRepository.deleteByUser(user);
        bankConnectionRepository.deleteByUser(user);
        userRepository.delete(user);
    }

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    public List<FinancialScoreHistory> getScoreHistory() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        return financialScoreHistoryRepository
                .findByUserOrderByMonthAsc(user);
    }

    // =========================
    // SCORE SNAPSHOT
    // FIXED: was inserting duplicate snapshots if called
    // multiple times in the same month — now upserts.
    // =========================

    public void saveScoreSnapshot(User user) {

        int score = calculateFinancialScore(user);
        String month = YearMonth.now().toString();

        FinancialScoreHistory history =
                financialScoreHistoryRepository
                        .findByUserOrderByMonthAsc(user)
                        .stream()
                        .filter(h -> h.getMonth().equals(month))
                        .findFirst()
                        .orElse(null);

        if (history == null) {
            history = new FinancialScoreHistory();
            history.setUser(user);
            history.setMonth(month);
        }

        history.setScore(score);
        financialScoreHistoryRepository.save(history);
    }

    // FIXED: now uses same formula as FinancialScoreService
    // to avoid score inconsistency across the app
    private int calculateFinancialScore(User user) {

        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        double income = transactions.stream()
                .filter(t -> t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount)
                .sum();

        double expenses = transactions.stream()
                .filter(t -> t.getAmount() < 0)
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double savings = income - expenses;
        double ratio = income > 0 ? (savings / income) * 100 : 0;

        int score = 40;
        if (ratio >= 40)      score += 30;
        else if (ratio >= 30) score += 22;
        else if (ratio >= 20) score += 15;
        else if (ratio >= 10) score +=  8;

        if (income > 0) {
            double expenseRatio = expenses / income;
            if (expenseRatio > 0.90)      score -= 15;
            else if (expenseRatio > 0.80) score -= 10;
            else if (expenseRatio > 0.70) score -=  5;
        }

        if (income == 0) score -= 20;

        return Math.max(0, Math.min(100, score));
    }
}