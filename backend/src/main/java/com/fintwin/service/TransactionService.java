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

            List<Transaction> toSave = new ArrayList<>();

            for (int i = 1; i < rows.size(); i++) {

                String[] row = rows.get(i);

                try {
                    if (row.length < 3) continue;

                    LocalDate txDate = DateNormalizer.parseFlexible(row[0]);
                    if (txDate == null) {
                        log.warn("Skipping CSV row {} — unparseable date '{}'", i, row[0]);
                        continue;
                    }

                    Transaction transaction = new Transaction();
                    transaction.setDate(txDate);
                    transaction.setMerchant(row[1].trim());
                    transaction.setAmount(
                            Double.parseDouble(row[2].trim())
                    );

                    String category = categoryService.categorize(
                            transaction.getMerchant()
                    );
                    transaction.setCategory(
                            category != null ? category : "Other"
                    );

                    transaction.setUser(user);
                    toSave.add(transaction);

                } catch (NumberFormatException e) {
                    // FIXED: use logger instead of System.err
                    log.warn("Skipping invalid CSV row {}: {}",
                            i, Arrays.toString(row));
                }
            }

            if (!toSave.isEmpty()) {
                repository.saveAll(toSave);
                profileService.saveScoreSnapshot(user);
            }

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
                transaction.getMerchant()
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
    // BATCH IMPORT (CSV)
    // Single request for all rows — avoids per-row rate limiting
    // =========================

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
            description = "Batch CSV transaction import"
    )
    @Transactional
    public int importBatch(List<Map<String, Object>> rows) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        List<Transaction> toSave = new ArrayList<>();

        for (Map<String, Object> row : rows) {
            try {
                LocalDate date = row.get("date") != null
                        ? DateNormalizer.parseFlexible(row.get("date").toString())
                        : LocalDate.now();
                if (date == null) {
                    log.warn("Skipping import row — unparseable date '{}'", row.get("date"));
                    continue;
                }

                String merchant = row.get("merchant") != null
                        ? row.get("merchant").toString()
                        : "Unknown";

                Object rawAmt = row.get("amount");
                if (rawAmt == null) continue;
                double amount = ((Number) rawAmt).doubleValue();
                if (amount == 0.0) continue;

                String category = row.get("category") != null
                        && !row.get("category").toString().isBlank()
                        ? row.get("category").toString()
                        : categoryService.categorize(merchant) != null
                                ? categoryService.categorize(merchant)
                                : "Other";

                Transaction t = new Transaction();
                t.setDate(date);
                t.setMerchant(merchant);
                t.setAmount(amount);
                t.setCategory(category);
                t.setSource("MANUAL");
                t.setUser(user);
                toSave.add(t);

            } catch (Exception e) {
                log.warn("Skipping malformed import row: {}", e.getMessage());
            }
        }

        if (!toSave.isEmpty()) {
            repository.saveAll(toSave);
            profileService.saveScoreSnapshot(user);
        }

        return toSave.size();
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

            String category = categoryService.categorize(merchant);
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