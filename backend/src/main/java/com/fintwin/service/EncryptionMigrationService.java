package com.fintwin.service;

import com.fintwin.repository.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * One-shot migration: re-saves every entity that has encrypted fields so that
 * any legacy plain-text values get encrypted by the JPA converter on write.
 *
 * Trigger via POST /admin/migrate-encryption (requires X-Admin-Key header).
 * Safe to run multiple times — already-encrypted rows are decrypted then
 * re-encrypted with a fresh IV, which is harmless.
 */
@Service
public class EncryptionMigrationService {

    private static final Logger log = LoggerFactory.getLogger(EncryptionMigrationService.class);

    private final UserRepository userRepository;
    private final TransactionRepository transactionRepository;
    private final AssetRepository assetRepository;
    private final LiabilityRepository liabilityRepository;
    private final FinancialGoalRepository financialGoalRepository;
    private final InvestmentRepository investmentRepository;
    private final BankConnectionRepository bankConnectionRepository;
    private final CryptoConnectionRepository cryptoConnectionRepository;
    private final ChatHistoryRepository chatHistoryRepository;
    private final NotificationRepository notificationRepository;
    private final BudgetRepository budgetRepository;
    private final InsurancePolicyRepository insurancePolicyRepository;
    private final SupportTicketRepository supportTicketRepository;

    public EncryptionMigrationService(
            UserRepository userRepository,
            TransactionRepository transactionRepository,
            AssetRepository assetRepository,
            LiabilityRepository liabilityRepository,
            FinancialGoalRepository financialGoalRepository,
            InvestmentRepository investmentRepository,
            BankConnectionRepository bankConnectionRepository,
            CryptoConnectionRepository cryptoConnectionRepository,
            ChatHistoryRepository chatHistoryRepository,
            NotificationRepository notificationRepository,
            BudgetRepository budgetRepository,
            InsurancePolicyRepository insurancePolicyRepository,
            SupportTicketRepository supportTicketRepository) {
        this.userRepository = userRepository;
        this.transactionRepository = transactionRepository;
        this.assetRepository = assetRepository;
        this.liabilityRepository = liabilityRepository;
        this.financialGoalRepository = financialGoalRepository;
        this.investmentRepository = investmentRepository;
        this.bankConnectionRepository = bankConnectionRepository;
        this.cryptoConnectionRepository = cryptoConnectionRepository;
        this.chatHistoryRepository = chatHistoryRepository;
        this.notificationRepository = notificationRepository;
        this.budgetRepository = budgetRepository;
        this.insurancePolicyRepository = insurancePolicyRepository;
        this.supportTicketRepository = supportTicketRepository;
    }

    @Transactional
    public MigrationResult migrateAll() {
        int total = 0;

        total += migrate("users",           userRepository);
        total += migrate("transactions",    transactionRepository);
        total += migrate("assets",          assetRepository);
        total += migrate("liabilities",     liabilityRepository);
        total += migrate("financial_goals", financialGoalRepository);
        total += migrate("investments",     investmentRepository);
        total += migrate("bank_connections",bankConnectionRepository);
        total += migrate("crypto_connections", cryptoConnectionRepository);
        total += migrate("chat_history",    chatHistoryRepository);
        total += migrate("notifications",   notificationRepository);
        total += migrate("budgets",         budgetRepository);
        total += migrate("insurance_policy",insurancePolicyRepository);
        total += migrate("support_tickets", supportTicketRepository);

        log.info("Encryption migration complete — {} rows re-encrypted.", total);
        return new MigrationResult(total, "Migration complete. All legacy rows are now encrypted.");
    }

    private int migrate(String label,
                        org.springframework.data.jpa.repository.JpaRepository<?, ?> repo) {
        @SuppressWarnings("unchecked")
        var items = ((org.springframework.data.jpa.repository.JpaRepository<Object, ?>) repo).findAll();
        int count = items.size();
        ((org.springframework.data.jpa.repository.JpaRepository<Object, ?>) repo).saveAll(items);
        log.info("  {} → {} rows re-saved", label, count);
        return count;
    }

    public record MigrationResult(int rowsProcessed, String message) {}
}
