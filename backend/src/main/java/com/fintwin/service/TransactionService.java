package com.fintwin.service;

import com.fintwin.config.FinTwinMetrics;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Transaction;
import com.fintwin.repository.TransactionRepository;
import com.opencsv.CSVReader;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.DateNormalizer;
import com.fintwin.util.StatementImport;
import com.fintwin.util.TransactionMath;
import com.fintwin.audit.Audited;

import java.time.LocalDate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Caching;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.http.*;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.core.io.ByteArrayResource;

import java.io.InputStreamReader;
import java.util.*;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import jakarta.annotation.PostConstruct;

@Service
public class TransactionService {

    // FIXED: replaced System.err.println with proper SLF4J logger
    private static final Logger log =
            LoggerFactory.getLogger(TransactionService.class);

    @Autowired
    private TransactionRepository repository;

    @Autowired
    private CategoryService categoryService;

    @Autowired
    private ExpenseParserService parserService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProfileService profileService;

    @Autowired
    private SmsService smsService;

    @Autowired
    private FinTwinMetrics metrics;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    // Used to run multi-write DB work in a tight transaction so blocking external
    // calls (SMS/AI) can happen AFTER commit rather than holding a DB connection.
    @Autowired
    private PlatformTransactionManager txManager;
    private TransactionTemplate txTemplate;

    @PostConstruct
    void initTxTemplate() {
        this.txTemplate = new TransactionTemplate(txManager);
    }

    // =========================
    // UPLOAD CSV
    // =========================

    private static final Set<String> ALLOWED_CSV_TYPES = Set.of(
            "text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"
    );
    private static final long MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

    private static final Set<String> ALLOWED_IMAGE_TYPES = Set.of(
            "image/png", "image/jpeg", "image/jpg", "image/webp", "image/heic"
    );
    private static final long MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Audited(
            action = "UPLOAD",
            resource = "transactions",
            description = "CSV transaction bulk import"
    )
    @Transactional
    public void uploadCSV(MultipartFile file) {
        String declaredType = file.getContentType();
        if (declaredType == null || !ALLOWED_CSV_TYPES.contains(
                declaredType.toLowerCase().split(";")[0].trim()))
            throw new IllegalArgumentException(
                    "Invalid file type '" + declaredType + "'. Only CSV files are accepted.");
        if (file.getSize() > MAX_CSV_BYTES)
            throw new IllegalArgumentException("File too large. Maximum CSV size is 5 MB.");

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        try (CSVReader reader = new CSVReader(
                new InputStreamReader(file.getInputStream()))) {

            List<String[]> rows = reader.readAll();

            if (rows.isEmpty()) return;

            // Fixed layout: date, merchant, amount. Routed through the same
            // import path as the column-mapped importer, so this endpoint gets
            // the same dedupe, amount parsing and categorisation.
            List<Map<String, Object>> mapped = new ArrayList<>();
            for (int i = 1; i < rows.size(); i++) {
                String[] row = rows.get(i);
                if (row.length < 3) continue;
                Map<String, Object> m = new HashMap<>();
                m.put("date", row[0]);
                m.put("merchant", row[1]);
                m.put("amount", row[2]);
                mapped.add(m);
            }
            importRows(user, mapped, false);

        } catch (Exception e) {
            throw new RuntimeException(
                    "Failed to process CSV file: " + e.getMessage()
            );
        }
    }

    // =========================
    // GET ALL TRANSACTIONS
    // FIXED: was missing @Audited — READ access on
    // financial data must be logged for PCI-DSS 10.2
    // =========================

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    @Audited(
            action = "READ",
            resource = "transactions",
            description = "Retrieve all transactions"
    )
    public List<Transaction> getAllTransactions() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        LocalDate cutoff = LocalDate.now().minusMonths(2).withDayOfMonth(1);
        return repository.findLatestThreeMonthsTransactions(user.getId(), cutoff);
    }

    // =========================
    // ADD EXPENSE BY TEXT
    // =========================

    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Audited(
            action = "WRITE",
            resource = "transactions",
            description = "Expense transaction created via text"
    )
    public Transaction addExpenseByText(String text) {

        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException(
                    "Expense text must not be empty"
            );
        }

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        Transaction transaction = parserService.parseExpense(text);

        if (transaction.getAmount() != null && transaction.getAmount() > 0) {
            transaction.setAmount(-transaction.getAmount());
        }

        String category = categoryService.categorize(
                transaction.getMerchant(),
                categoryService.learnedRulesFor(user)
        );
        transaction.setCategory(
                category != null ? category : "Other"
        );

        transaction.setUser(user);

        // Persist transaction + score snapshot atomically; fire the SMS alert AFTER
        // commit so the blocking network call never holds a DB connection open.
        Transaction saved = txTemplate.execute(status -> {
            Transaction s = repository.save(transaction);
            profileService.saveScoreSnapshot(user);
            return s;
        });
        metrics.transactionsCreated.increment();

        if (user.getPhone() != null && Boolean.TRUE.equals(user.getPhoneVerified())) {
            smsService.sendTransactionAlert(user.getPhone(), saved.getAmount(),
                    saved.getMerchant());
        }

        return saved;
    }

    // =========================
    // ADD INCOME BY TEXT
    // =========================

    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Audited(
            action = "WRITE",
            resource = "transactions",
            description = "Income transaction created via text"
    )
    @Transactional
    public Transaction addIncomeByText(String text) {

        if (text == null || text.isBlank()) {
            throw new IllegalArgumentException(
                    "Income text must not be empty"
            );
        }

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        Transaction transaction = parserService.parseExpense(text);

        transaction.setAmount(Math.abs(transaction.getAmount()));
        transaction.setCategory("Income");
        transaction.setUser(user);

        Transaction saved = repository.save(transaction);
        profileService.saveScoreSnapshot(user);

        return saved;
    }

    // =========================
    // ADD MANUAL TRANSACTION (CSV Import)
    // =========================

    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Transactional
    public Transaction addManualTransaction(
            String date, String merchant, Double amount, String category) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        LocalDate txDate = DateNormalizer.parseFlexible(date);

        Transaction t = new Transaction();
        t.setDate(txDate != null ? txDate : LocalDate.now());
        t.setMerchant(merchant != null ? merchant : "Unknown");
        t.setAmount(amount != null ? amount : 0.0);
        t.setCategory(category != null && !category.isBlank() ? category : "Other");
        t.setSource("MANUAL");
        t.setUser(user);

        Transaction saved = repository.save(t);
        profileService.saveScoreSnapshot(user);
        return saved;
    }

    // =========================
    // BATCH IMPORT (bank / card statement)
    // Single request for all rows — avoids per-row rate limiting
    // =========================

    /**
     * Imports rows from a bank or credit-card statement.
     *
     * Re-importing a statement, or two statements whose dates overlap, must not
     * double the user's spending, so each row gets a stable externalId and rows
     * already on record are skipped. Categories are derived from the narration
     * unless the file carried a real one — statements never do, and a generic
     * placeholder must not block auto-categorisation.
     *
     * @param accountType "BANK" (default) or "CARD". Card rows are stored with
     *                    source CARD, which switches on the bill-payment
     *                    double-count guard exactly as an AA card sync does.
     */
    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Audited(
            action = "UPLOAD",
            resource = "transactions",
            description = "Statement transaction import"
    )
    @Transactional
    public ImportResult importBatch(List<Map<String, Object>> rows, String accountType) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        return importRows(user, rows, ACCOUNT_CARD.equalsIgnoreCase(accountType));
    }

    /** Outcome of one import, so the UI can say "12 already imported". */
    public record ImportResult(int imported, int duplicates, int skipped) {}

    public static final String ACCOUNT_BANK = "BANK";
    public static final String ACCOUNT_CARD = "CARD";

    // Placeholder categories an importer sends when the file had none. Treated
    // as absent so the narration still gets categorised.
    private static final Set<String> PLACEHOLDER_CATEGORIES =
            Set.of("", "other", "others", "uncategorized", "uncategorised", "misc");

    private ImportResult importRows(User user, List<Map<String, Object>> rows, boolean isCard) {

        Map<String, String> learnedRules = categoryService.learnedRulesFor(user);
        Set<String> existingIds = new HashSet<>(repository.findExternalIdsByUser(user));
        boolean cardDataPresent = isCard || repository.countByUserAndSource(user, ACCOUNT_CARD) > 0;

        Map<String, Integer> siblingCounts = new HashMap<>();
        List<Transaction> toSave = new ArrayList<>();
        int duplicates = 0;
        int skipped = 0;

        for (Map<String, Object> row : rows) {
            try {
                // A bulk import carries its own dates; a row without one is not
                // a transaction that happened today, it is a row we cannot
                // place in time. Stamping it with today's date silently piles
                // whole batches onto the import date and corrupts every
                // month-based figure built on top.
                LocalDate date = row.get("date") != null
                        ? DateNormalizer.parseFlexible(row.get("date").toString())
                        : null;
                if (date == null) {
                    log.warn("Skipping import row — missing or unparseable date '{}'",
                             row.get("date"));
                    skipped++;
                    continue;
                }

                Double amount = StatementImport.parseAmount(row.get("amount"));
                if (amount == null || amount == 0.0) {
                    skipped++;
                    continue;
                }

                String merchant = row.get("merchant") != null
                        && !row.get("merchant").toString().isBlank()
                        ? row.get("merchant").toString().trim()
                        : "Unknown";
                Double balance = StatementImport.parseAmount(row.get("balance"));

                // Identical rows in one file are real (two ₹20 chais), so each
                // gets its position among its siblings as part of its identity.
                String sibling = StatementImport.siblingKey(date, amount, merchant, balance);
                int ordinal = siblingCounts.merge(sibling, 1, Integer::sum) - 1;
                String externalId = StatementImport.externalId(date, amount, merchant, balance, ordinal);
                if (!existingIds.add(externalId)) {
                    duplicates++;
                    continue;
                }

                Transaction t = new Transaction();
                t.setDate(date);
                t.setMerchant(merchant);
                t.setAmount(amount);
                t.setCategory(importCategory(row.get("category"), merchant, amount,
                                             isCard, cardDataPresent, learnedRules));
                t.setSource(isCard ? ACCOUNT_CARD : "STATEMENT");
                t.setExternalId(externalId);
                t.setUser(user);
                toSave.add(t);

            } catch (Exception e) {
                log.warn("Skipping malformed import row: {}", e.getMessage());
                skipped++;
            }
        }

        if (!toSave.isEmpty()) {
            repository.saveAll(toSave);

            // The first card statement makes bank-side bill payments already on
            // record duplicates of these purchases — restamp them, as the AA
            // card sync does.
            if (isCard) {
                List<Transaction> restamped =
                        TransactionMath.restampCardBillPayments(repository.findByUser(user));
                if (!restamped.isEmpty()) {
                    repository.saveAll(restamped);
                    log.info("Statement import: reclassified {} bank-side bill payments for user #{}",
                             restamped.size(), user.getId());
                }
            }

            profileService.saveScoreSnapshot(user);
        }

        return new ImportResult(toSave.size(), duplicates, skipped);
    }

    /**
     * Category for an imported row. Mirrors the AA ingest rules so a statement
     * and a bank sync of the same money land in the same place.
     */
    private String importCategory(Object provided, String narration, double amount,
                                  boolean isCard, boolean cardDataPresent,
                                  Map<String, String> learnedRules) {
        boolean isCredit = amount > 0;

        if (isCard && isCredit) {
            // A card credit is the user repaying the bill (not spending, not
            // income) or money coming back from a merchant.
            return TransactionMath.isRefundLike(narration)
                    ? "Other"
                    : TransactionMath.CARD_PAYMENT_CATEGORY;
        }
        if (!isCard && !isCredit && cardDataPresent
                && TransactionMath.matchesCardPayment(narration)) {
            // Bank-side leg of a bill payment whose card purchases are on record.
            return TransactionMath.CARD_PAYMENT_CATEGORY;
        }

        if (provided != null
                && !PLACEHOLDER_CATEGORIES.contains(provided.toString().trim().toLowerCase())) {
            return provided.toString().trim();
        }

        String derived = categoryService.categorize(narration, learnedRules);
        return derived != null ? derived : "Other";
    }

    // =========================
    // UPDATE CATEGORY (manual recategorization)
    // Learns a per-user merchant→category rule so future transactions
    // from the same payee auto-categorize; optionally fixes history too.
    // =========================

    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Audited(
            action = "WRITE",
            resource = "transactions",
            description = "Transaction manually recategorized"
    )
    @Transactional
    public Map<String, Object> updateCategory(
            Long id, String category, boolean applyToSimilar, boolean remember) {

        if (category == null || category.isBlank()) {
            throw new IllegalArgumentException("Category must not be empty");
        }
        category = category.trim();

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        Transaction txn = repository.findById(id)
                .filter(t -> t.getUser() != null
                        && t.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new NotFoundException("Transaction not found"));

        txn.setCategory(category);
        repository.save(txn);

        if (remember) {
            categoryService.rememberRule(user, txn.getMerchant(), category);
        }

        int similarUpdated = 0;
        if (applyToSimilar) {
            String pattern = categoryService.normalizeMerchant(txn.getMerchant());
            if (!pattern.isBlank()) {
                List<Transaction> toUpdate = new ArrayList<>();
                for (Transaction t : repository.findByUser(user)) {
                    if (t.getId().equals(txn.getId())) continue;
                    if (category.equals(t.getCategory())) continue;
                    if (categoryService.normalizeMerchant(t.getMerchant())
                            .equals(pattern)) {
                        t.setCategory(category);
                        toUpdate.add(t);
                    }
                }
                if (!toUpdate.isEmpty()) {
                    repository.saveAll(toUpdate);
                    similarUpdated = toUpdate.size();
                }
            }
        }

        return Map.of(
                "transaction", com.fintwin.dto.TransactionDTO.from(txn),
                "similarUpdated", similarUpdated
        );
    }

    // =========================
    // UPLOAD SCREENSHOT (OCR)
    // =========================

    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Audited(
            action = "UPLOAD",
            resource = "ocr",
            description = "Receipt screenshot uploaded for OCR extraction"
    )
    public Transaction uploadScreenshot(MultipartFile file) {

        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException(
                    "Screenshot file must not be empty"
            );
        }

        String declaredType = file.getContentType();
        if (declaredType == null || !ALLOWED_IMAGE_TYPES.contains(
                declaredType.toLowerCase().split(";")[0].trim())) {
            throw new IllegalArgumentException(
                    "Invalid file type '" + declaredType + "'. Only image files are accepted.");
        }
        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new IllegalArgumentException("File too large. Maximum image size is 10 MB.");
        }

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body =
                    new LinkedMultiValueMap<>();

            body.add("file",
                    new ByteArrayResource(file.getBytes()) {
                        @Override
                        public String getFilename() {
                            return file.getOriginalFilename();
                        }
                    }
            );

            HttpEntity<MultiValueMap<String, Object>> requestEntity =
                    new HttpEntity<>(body, headers);

            ResponseEntity<Map> response = aiRestTemplate.postForEntity(
                    aiServiceUrl + "/ocr",
                    requestEntity,
                    Map.class
            );

            Map result = response.getBody();

            if (result == null
                    || result.get("merchant") == null
                    || result.get("amount") == null) {
                throw new RuntimeException(
                        "OCR service returned incomplete data"
                );
            }

            String merchant = result.get("merchant").toString();
            double amount = Double.parseDouble(
                    result.get("amount").toString()
            );

            if (amount <= 0) {
                throw new RuntimeException(
                        "OCR returned invalid amount: " + amount
                );
            }

            Transaction transaction = new Transaction();
            transaction.setMerchant(merchant);
            transaction.setAmount(-amount);
            transaction.setDate(java.time.LocalDate.now());

            String category = categoryService.categorize(
                    merchant, categoryService.learnedRulesFor(user));
            transaction.setCategory(
                    category != null ? category : "Other"
            );

            transaction.setUser(user);

            // OCR call already completed above (outside any tx). Persist the result
            // + score snapshot atomically.
            return txTemplate.execute(status -> {
                Transaction s = repository.save(transaction);
                profileService.saveScoreSnapshot(user);
                return s;
            });

        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(
                    "Screenshot upload failed: " + e.getMessage()
            );
        }
    }

    // =========================
    // AI CHAT
    // FIXED: was missing @Audited — AI chat sends
    // financial context data externally; must be
    // logged for PCI-DSS 10.2 accountability.
}