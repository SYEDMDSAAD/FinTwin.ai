package com.fintwin.demo;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.AssetRepository;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.ChatHistoryRepository;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.FinancialScoreHistoryRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.LiabilityRepository;
import com.fintwin.repository.NotificationRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.EmailHashUtil;
import com.fintwin.service.ProfileService;
import com.fintwin.util.TransactionMath;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

/**
 * The shared demo account behind "Try the demo": a user that already has
 * data, so visitors see FinTwin working without signing up or uploading a
 * statement.
 *
 * It is an ordinary row in users with the DEMO role, so real users' data is
 * never touched. Its data is generated (see DemoData) and rebuilt every
 * night, and at startup when it has gone stale, so dates stay current and
 * anything a visitor's session left behind is cleared.
 */
@Service
public class DemoAccountService {

    private static final Logger log = LoggerFactory.getLogger(DemoAccountService.class);
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    // .invalid is reserved (RFC 2606): nothing can ever be delivered there,
    // so password-reset and other mail for this account goes nowhere
    public static final String EMAIL = "demo@fintwin.invalid";
    static final String NAME = "Riya Mehta";

    private final boolean enabled;
    private final UserRepository users;
    private final TransactionRepository transactions;
    private final BudgetRepository budgets;
    private final FinancialGoalRepository goals;
    private final AssetRepository assets;
    private final LiabilityRepository liabilities;
    private final InvestmentRepository investments;
    private final ChatHistoryRepository chats;
    private final NotificationRepository notifications;
    private final FinancialScoreHistoryRepository scores;
    private final ProfileService profiles;
    private final PasswordEncoder passwords;
    private final TransactionTemplate tx;

    public DemoAccountService(@Value("${demo.enabled:true}") boolean enabled,
                              UserRepository users, TransactionRepository transactions, BudgetRepository budgets,
                              FinancialGoalRepository goals, AssetRepository assets,
                              LiabilityRepository liabilities, InvestmentRepository investments,
                              ChatHistoryRepository chats, NotificationRepository notifications,
                              FinancialScoreHistoryRepository scores, ProfileService profiles,
                              PasswordEncoder passwords, TransactionTemplate tx) {
        this.enabled = enabled;
        this.users = users;
        this.transactions = transactions;
        this.budgets = budgets;
        this.goals = goals;
        this.assets = assets;
        this.liabilities = liabilities;
        this.investments = investments;
        this.chats = chats;
        this.notifications = notifications;
        this.scores = scores;
        this.profiles = profiles;
        this.passwords = passwords;
        this.tx = tx;
    }

    public boolean isEnabled() {
        return enabled;
    }

    /** The demo user, created if it doesn't exist yet. */
    public User demoUser() {
        return users.findByEmail(EMAIL).orElseGet(this::createUser);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        if (!enabled) return;
        try {
            User user = demoUser();
            LocalDate latest = transactions.latestTransactionDate(user.getId());
            LocalDate today = LocalDate.now(INDIA);
            if (latest == null || latest.isBefore(today.minusDays(1))) rebuild();
        } catch (Exception e) {
            // A demo that fails to build must not take the app down with it
            log.error("Demo account not prepared at startup", e);
        }
    }

    /** Nightly: fresh dates, and whatever a visitor's session changed is gone. */
    @Scheduled(cron = "${demo.rebuild-cron:0 15 3 * * *}", zone = "Asia/Kolkata")
    public void nightly() {
        if (!enabled) return;
        try {
            rebuild();
        } catch (Exception e) {
            log.error("Demo account rebuild failed", e);
        }
    }

    /** Clears the demo account and fills it again with data ending today. */
    public void rebuild() {
        tx.executeWithoutResult(status -> {
            User user = demoUser();
            chats.deleteByUser(user);
            transactions.deleteByUser(user);
            goals.deleteByUser(user);
            budgets.deleteByUser(user);
            assets.deleteByUser(user);
            liabilities.deleteByUser(user);
            investments.deleteByUser(user);
            notifications.deleteByUser(user);
            scores.deleteByUser(user);
            // Hibernate runs inserts before deletes when it flushes, so without
            // this the new budgets collide with the old ones (one per category)
            transactions.flush();

            DemoData data = new DemoData(user, LocalDate.now(INDIA));
            List<Transaction> rows = data.transactions();
            transactions.saveAll(rows);
            budgets.saveAll(data.budgets());
            assets.saveAll(data.assets());
            liabilities.saveAll(data.liabilities());
            investments.saveAll(data.investments());
            goals.saveAll(data.goals(monthlySavings(rows)));
            profiles.saveScoreSnapshot(user);
            log.info("Demo account rebuilt: {} transactions", rows.size());
        });
    }

    private User createUser() {
        User user = new User();
        user.setEmail(EMAIL);
        user.setEmailHash(EmailHashUtil.hash(EMAIL));
        user.setFullName(NAME);
        // Nobody signs in with a password: the demo is entered only through
        // the demo endpoint, which issues its own short-lived token
        user.setPassword(passwords.encode(UUID.randomUUID().toString()));
        user.setRole(DemoSession.ROLE);
        user.setEmailVerified(true);
        user.setOnboardingCompleted(true);
        user.setConsentGivenAt(LocalDateTime.now());
        user.setEnabled(true);
        return users.save(user);
    }

    private static double monthlySavings(List<Transaction> rows) {
        int months = TransactionMath.monthsPresent(rows);
        return (TransactionMath.income(rows) - TransactionMath.expenses(rows)) / months;
    }
}
