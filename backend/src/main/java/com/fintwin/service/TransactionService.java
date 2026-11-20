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
    private CategorySuggestionService suggestionService;

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
        return getTransactions(DEFAULT_MONTHS, null);
    }

    /** The newest full months the page asks for; 0 = everything the user has imported. */
    public static final int DEFAULT_MONTHS = 3;
    public static final int MAX_MONTHS = 600;

    /**
     * @param months how many calendar months back to include, counting this
     *               one; 0 (or more than {@link #MAX_MONTHS}) means all of it
     * @param category only this category, when given — the heatmap sorting out
     *                 one category doesn't need every other row with it
     */
    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    @Audited(action = "READ", resource = "transactions", description = "Retrieve transactions")
    public List<Transaction> getTransactions(int months, String category) {
        User user = userRepository
                .findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));

        List<Transaction> rows;
        if (months <= 0 || months > MAX_MONTHS) {
            rows = repository.findByUser(user);
        } else {
            // Anchored on the user's newest transaction: a statement imported
            // late ends in the past, and "last 3 months" from today is empty
            rows = repository.findLatestThreeMonthsTransactions(
                    user.getId(), repository.recentCutoff(user.getId(), months));
        }
        if (category == null || category.isBlank()) return rows;
        String wanted = category.trim();
        return rows.stream().filter(t -> wanted.equalsIgnoreCase(t.getCategory())).toList();
    }

    /**
     * What the user has spent per category over a window, summed here rather
     * than by sending every row to the browser: the spending heatmap covers
     * the user's whole history, which can be years of transactions.
     */
    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    public Map<String, Object> categoryTotals(int months) {
        List<Transaction> rows = getTransactions(months, null);
        Map<String, double[]> totals = new LinkedHashMap<>();        // category → [spent, count]
        LocalDate first = null, last = null;
        for (Transaction t : rows) {
            if (t.getDate() != null) {
                if (first == null || t.getDate().isBefore(first)) first = t.getDate();
                if (last == null || t.getDate().isAfter(last)) last = t.getDate();
            }
            if (t.getAmount() == null || t.getAmount() >= 0 || TransactionMath.isSelfTransfer(t)) continue;
            double[] c = totals.computeIfAbsent(
                    t.getCategory() == null || t.getCategory().isBlank() ? "Other" : t.getCategory(),
                    k -> new double[2]);
            c[0] += Math.abs(t.getAmount());
            c[1]++;
        }

        List<Map<String, Object>> categories = totals.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getValue()[0], a.getValue()[0]))
                .map(e -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("category", e.getKey());
                    m.put("total", Math.round(e.getValue()[0] * 100) / 100.0);
                    m.put("count", (int) e.getValue()[1]);
                    return m;
                }).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("categories", categories);
        out.put("transactions", rows.size());
        out.put("from", first);
        out.put("to", last);
        return out;
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

        transaction.applyPrediction(categoryService.classify(
                transaction.getMerchant(),
                categoryService.learnedRulesFor(user),
                transaction.getAmount()
        ));

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
        transaction.applyUserCategory("Income");
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
        if (category != null && !category.isBlank()) t.applyUserCategory(category);
        else t.applyPrediction(com.fintwin.util.Categorized.other());
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
     * @param account     the account as the user names it ("HDFC ··1234"); stored
     *                    on every row so coverage can be shown per account
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
    public ImportResult importBatch(List<Map<String, Object>> rows, String accountType, String account) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() -> new NotFoundException("User not found"));

        return importRows(user, rows, ACCOUNT_CARD.equalsIgnoreCase(accountType), cleanAccountRef(account));
    }

    /**
     * Outcome of one import, so the UI can say "12 already imported".
     * {@code reconciled} counts rows that were already on record from alert
     * emails: the statement row took them over rather than adding a second copy.
     */
    public record ImportResult(int imported, int duplicates, int skipped, int reconciled, int notInStatement) {
        public ImportResult(int imported, int duplicates, int skipped) {
            this(imported, duplicates, skipped, 0, 0);
        }
        public ImportResult(int imported, int duplicates, int skipped, int reconciled) {
            this(imported, duplicates, skipped, reconciled, 0);
        }
    }

    private static String cleanAccountRef(String account) {
        if (account == null || account.isBlank()) return null;
        String a = account.trim().replaceAll("\\s+", " ");
        return a.length() > 64 ? a.substring(0, 64) : a;
    }

    public static final String ACCOUNT_BANK = "BANK";
    public static final String ACCOUNT_CARD = "CARD";

    // Placeholder categories an importer sends when the file had none. Treated
    // as absent so the narration still gets categorised.
    private static final Set<String> PLACEHOLDER_CATEGORIES =
            Set.of("", "other", "others", "uncategorized", "uncategorised", "misc");

    private ImportResult importRows(User user, List<Map<String, Object>> rows, boolean isCard) {
        return importRows(user, rows, isCard, null);
    }

    private ImportResult importRows(User user, List<Map<String, Object>> rows, boolean isCard, String accountRef) {

        Map<String, String> learnedRules = categoryService.learnedRulesFor(user);
        Set<String> existingIds = new HashSet<>(repository.findExternalIdsByUser(user));
        Set<String> idsBeforeThisFile = Set.copyOf(existingIds);
        List<Transaction> onRecord = repository.findByUser(user);
        boolean cardDataPresent = isCard || repository.countByUserAndSource(user, ACCOUNT_CARD) > 0;

        Map<String, Integer> siblingCounts = new HashMap<>();
        List<Transaction> toSave = new ArrayList<>();
        List<Transaction> takenOver = new ArrayList<>();
        int duplicates = 0;
        int skipped = 0;
        LocalDate firstDay = null, lastDay = null;       // the dates this file covers

        // Transactions that arrived from alert emails or Spend Guard payments and
        // no statement has claimed yet. A statement row for the same money
        // replaces them, keeping any name or category the user fixed.
        List<Transaction> fromAlerts = new ArrayList<>(onRecord.stream()
                .filter(t -> t.getExternalId() != null
                        && (t.getExternalId().startsWith(InboundEmailService.EXTERNAL_ID_PREFIX)
                            || t.getExternalId().startsWith(SpendGuardLinks.EXTERNAL_ID_PREFIX)))
                .filter(t -> t.getAmount() != null && t.getDate() != null)
                .toList());

        // Rows that repeat a payment an earlier statement of this account brought
        // in under another description (another app or bank's file)
        Set<Integer> overlapping = overlappingRows(rows, onRecord, idsBeforeThisFile,
                                                   isCard ? ACCOUNT_CARD : "STATEMENT", accountRef);

        for (int index = 0; index < rows.size(); index++) {
            Map<String, Object> row = rows.get(index);
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
                if (firstDay == null || date.isBefore(firstDay)) firstDay = date;
                if (lastDay == null || date.isAfter(lastDay)) lastDay = date;

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

                Optional<Transaction> alert = matchAlert(fromAlerts, date, amount, isCard, accountRef);
                if (alert.isPresent()) {
                    // Same money the alert email already recorded: the statement
                    // row becomes its identity (so re-imports dedupe against it),
                    // and the name and category the user may have fixed are kept
                    Transaction t = alert.get();
                    fromAlerts.remove(t);
                    t.setExternalId(externalId);
                    t.setSource(isCard ? ACCOUNT_CARD : "STATEMENT");
                    t.setDate(date);
                    if (accountRef != null) t.setAccountRef(accountRef);
                    takenOver.add(t);
                    continue;
                }

                if (overlapping.contains(index)) {
                    duplicates++;
                    continue;
                }

                Transaction t = new Transaction();
                t.setDate(date);
                t.setMerchant(merchant);
                t.setAmount(amount);
                t.applyPrediction(merchantRefCategory(
                        importCategory(row.get("category"), merchant, amount,
                                       isCard, cardDataPresent, learnedRules),
                        row.get("reference")));
                t.setSource(isCard ? ACCOUNT_CARD : "STATEMENT");
                t.setExternalId(externalId);
                t.setAccountRef(accountRef);
                t.setUser(user);
                toSave.add(t);

            } catch (Exception e) {
                log.warn("Skipping malformed import row: {}", e.getMessage());
                skipped++;
            }
        }

        if (!takenOver.isEmpty()) {
            repository.saveAll(takenOver);
        }

        // Spend Guard payments dated inside this statement that no row matched:
        // the user may not have paid, or paid from another account. They're
        // flagged for the user to answer (keep or remove), never deleted here.
        List<Transaction> notInStatement = new ArrayList<>();
        for (Transaction t : fromAlerts) {
            if (SpendGuardLinks.SOURCE.equals(t.getSource()) && firstDay != null
                    && !t.getDate().isBefore(firstDay) && !t.getDate().isAfter(lastDay)) {
                t.setSource(SpendGuardLinks.SOURCE_NOT_IN_STATEMENT);
                notInStatement.add(t);
            }
        }
        if (!notInStatement.isEmpty()) {
            repository.saveAll(notInStatement);
        }

        if (!toSave.isEmpty()) {
            repository.saveAll(toSave);
            applyPaymentPatterns(user);

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

        if (!overlapping.isEmpty()) {
            log.info("Statement import: {} rows matched earlier statement rows by date and amount for user #{}",
                     overlapping.size(), user.getId());
        }
        return new ImportResult(toSave.size(), duplicates, skipped, takenOver.size(), notInStatement.size());
    }

    /**
     * Positions of rows that repeat a payment an earlier statement import of the
     * same account already holds, described in other words (a UPI app's
     * "Paid to X" against a bank's "UPI/DR/412233/X/..."), so their exact key
     * misses. Decided over the whole file, so the result never depends on row
     * order (banks often list newest first):
     *   1. rows whose exact key is on record use up their own earlier row;
     *   2. the rest match an earlier row with the same amount on the same day;
     *   3. what is still unmatched may match one a day either side, as banks
     *      post a late-night payment the next day.
     * Each earlier row is matched once, so two real ₹20 chais on one day stay
     * two, and only earlier rows inside this file's dates count, so a payment on
     * the file's first day is never taken for one the day before it.
     */
    private static Set<Integer> overlappingRows(List<Map<String, Object>> rows, List<Transaction> onRecord,
                                                Set<String> idsBefore, String source, String accountRef) {
        record Row(int index, LocalDate date, double amount, String externalId) {}
        List<Row> parsed = new ArrayList<>();
        Map<String, Integer> siblings = new HashMap<>();
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> row = rows.get(i);
            try {
                LocalDate date = row.get("date") != null ? DateNormalizer.parseFlexible(row.get("date").toString()) : null;
                Double amount = StatementImport.parseAmount(row.get("amount"));
                if (date == null || amount == null || amount == 0.0) continue;
                String merchant = row.get("merchant") != null && !row.get("merchant").toString().isBlank()
                        ? row.get("merchant").toString().trim() : "Unknown";
                Double balance = StatementImport.parseAmount(row.get("balance"));
                int ordinal = siblings.merge(StatementImport.siblingKey(date, amount, merchant, balance), 1, Integer::sum) - 1;
                parsed.add(new Row(i, date, amount, StatementImport.externalId(date, amount, merchant, balance, ordinal)));
            } catch (Exception e) {
                // the import loop skips and counts this row
            }
        }
        if (parsed.isEmpty()) return Set.of();
        LocalDate first = parsed.stream().map(Row::date).min(LocalDate::compareTo).orElseThrow();
        LocalDate last = parsed.stream().map(Row::date).max(LocalDate::compareTo).orElseThrow();

        Map<String, Integer> earlier = new HashMap<>();
        Map<String, String> earlierKeyById = new HashMap<>();
        for (Transaction t : onRecord) {
            if (source.equals(t.getSource()) && t.getDate() != null && t.getAmount() != null
                    && !t.getDate().isBefore(first) && !t.getDate().isAfter(last)
                    && t.getExternalId() != null && t.getExternalId().startsWith(StatementImport.EXTERNAL_ID_PREFIX)
                    && StatementImport.sameAccount(t.getAccountRef(), accountRef)) {
                String key = StatementImport.overlapKey(t.getDate(), t.getAmount());
                earlier.merge(key, 1, Integer::sum);
                earlierKeyById.put(t.getExternalId(), key);
            }
        }
        if (earlier.isEmpty()) return Set.of();

        List<Row> unmatched = new ArrayList<>();
        for (Row r : parsed) {
            if (idsBefore.contains(r.externalId())) {
                String key = earlierKeyById.get(r.externalId());
                if (key != null) StatementImport.takeOne(earlier, key);
            } else {
                unmatched.add(r);
            }
        }
        Set<Integer> out = new HashSet<>();
        for (Row r : unmatched) {
            if (StatementImport.takeOne(earlier, StatementImport.overlapKey(r.date(), r.amount()))) out.add(r.index());
        }
        for (Row r : unmatched) {
            if (out.contains(r.index())) continue;
            if (StatementImport.takeOne(earlier, StatementImport.overlapKey(r.date().minusDays(1), r.amount()))
                    || StatementImport.takeOne(earlier, StatementImport.overlapKey(r.date().plusDays(1), r.amount()))) {
                out.add(r.index());
            }
        }
        return out;
    }

    /**
     * The alert-email transaction a statement row describes: same amount, a
     * day either side (alerts carry the transaction date, statements sometimes
     * the posting date), same side of the card/bank line, and not tied to a
     * different account.
     */
    static Optional<Transaction> matchAlert(List<Transaction> fromAlerts, LocalDate date, double amount,
                                            boolean isCard, String accountRef) {
        return fromAlerts.stream()
                .filter(t -> Math.abs(t.getAmount() - amount) < 0.005)
                .filter(t -> Math.abs(t.getDate().toEpochDay() - date.toEpochDay()) <= 1)
                .filter(t -> ACCOUNT_CARD.equals(t.getSource()) == isCard)
                .filter(t -> accountRef == null || t.getAccountRef() == null
                        || sameAccount(t.getAccountRef(), accountRef))
                .min(java.util.Comparator.comparingLong(
                        t -> Math.abs(t.getDate().toEpochDay() - date.toEpochDay())));
    }

    // "HDFC ··1234" from an alert and "HDFC Savings ··1234" typed by the user
    // are the same account: compare the masked digits when both have them
    private static boolean sameAccount(String a, String b) {
        String da = a.replaceAll("\\D", "");
        String db = b.replaceAll("\\D", "");
        if (!da.isEmpty() && !db.isEmpty()) return da.endsWith(db) || db.endsWith(da);
        return a.equalsIgnoreCase(b);
    }

    /**
     * Category for an imported row. Mirrors the AA ingest rules so a statement
     * and a bank sync of the same money land in the same place.
     */
    private com.fintwin.util.Categorized importCategory(Object provided, String narration, double amount,
                                  boolean isCard, boolean cardDataPresent,
                                  Map<String, String> learnedRules) {
        String forced = TransactionMath.forcedImportCategory(narration, amount, isCard, cardDataPresent);
        if (forced != null) return new com.fintwin.util.Categorized(forced, com.fintwin.util.Categorized.FORCED);

        if (provided != null
                && !PLACEHOLDER_CATEGORIES.contains(provided.toString().trim().toLowerCase())) {
            return new com.fintwin.util.Categorized(provided.toString().trim(), com.fintwin.util.Categorized.PROVIDED);
        }

        return categoryService.classify(narration, learnedRules, amount);
    }

    /**
     * A row whose payment-app id marks a merchant QR is a shop, even when its
     * name reads like a person's or says nothing. Anything a rule placed more
     * surely (a brand, a shop word, the user's own rule) is kept.
     */
    private static com.fintwin.util.Categorized merchantRefCategory(
            com.fintwin.util.Categorized c, Object reference) {
        boolean weak = com.fintwin.util.Categorized.PERSON.equals(c.source())
                || com.fintwin.util.Categorized.NONE.equals(c.source());
        if (weak && reference != null
                && com.fintwin.util.MerchantCategorizer.isMerchantReference(reference.toString())) {
            return new com.fintwin.util.Categorized(com.fintwin.util.MerchantCategorizer.LOCAL_SHOPS,
                    com.fintwin.util.Categorized.MERCHANT_REF);
        }
        return c;
    }

    /**
     * Re-places every person-looking payee by how the user pays them, across
     * all their money rather than one file: a later statement showing the
     * payee sending money back turns a "shop" into a person. Rows the user
     * reviewed are left alone.
     */
    private void applyPaymentPatterns(User user) {
        List<Transaction> all = repository.findByUser(user);
        com.fintwin.util.PaymentPatterns.Ledger ledger = new com.fintwin.util.PaymentPatterns.Ledger();
        for (Transaction t : all) ledger.add(t.getMerchant(), t.getAmount());

        List<Transaction> changed = new ArrayList<>();
        for (Transaction t : all) {
            if (t.getCategoryReview() != null) continue;
            com.fintwin.util.PaymentPatterns
                    .refine(t.getCategorySource(), t.getMerchant(), ledger.of(t.getMerchant()))
                    .filter(c -> !c.category().equals(t.getCategory()))
                    .ifPresent(c -> {
                        t.applyPrediction(c);
                        changed.add(t);
                    });
        }
        if (!changed.isEmpty()) repository.saveAll(changed);
    }

    // =========================
    // RE-SORT "OTHER" + GROUP WHAT'S LEFT
    // =========================

    private static final Set<String> UNSORTED = Set.of("other", "others", "uncategorized", "uncategorised");

    private static boolean unsorted(Transaction t) {
        return t.getCategory() == null || UNSORTED.contains(t.getCategory().trim().toLowerCase());
    }

    /**
     * Runs the current rules — the user's learned ones first — over every
     * transaction still in "Other". Rows imported before the rules improved
     * get sorted without being imported again. A category the user chose
     * (anything but Other) is never touched.
     */
    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Transactional
    public Map<String, Object> recategorizeUnsorted() {
        User user = userRepository.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));

        Map<String, String> learned = categoryService.learnedRulesFor(user);
        boolean cardData = repository.countByUserAndSource(user, ACCOUNT_CARD) > 0;
        List<Transaction> changed = new ArrayList<>();
        int remaining = 0;

        for (Transaction t : repository.findByUser(user)) {
            // A row the user put in Other themselves stays there
            if (!unsorted(t) || t.getAmount() == null || t.getCategoryReview() != null) continue;
            String forced = TransactionMath.forcedImportCategory(
                    t.getMerchant(), t.getAmount(), ACCOUNT_CARD.equals(t.getSource()), cardData);
            com.fintwin.util.Categorized c = forced != null
                    ? new com.fintwin.util.Categorized(forced, com.fintwin.util.Categorized.FORCED)
                    : categoryService.classify(t.getMerchant(), learned, t.getAmount());
            if (!UNSORTED.contains(c.category().toLowerCase())) {
                t.applyPrediction(c);
                changed.add(t);
            } else {
                remaining++;
            }
        }
        if (!changed.isEmpty()) repository.saveAll(changed);
        return Map.of("updated", changed.size(), "remaining", remaining);
    }

    /**
     * What's still in "Other", grouped by payee and biggest spend first — so
     * the user can sort most of the money with a handful of choices. Each
     * group carries one transaction id: recategorising it with
     * applyToSimilar sorts the whole group and remembers the payee.
     */
    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    public List<Map<String, Object>> unsortedPayees(int limit) {
        User user = userRepository.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));

        Map<String, Object[]> groups = new LinkedHashMap<>();   // key → {name, count, total, sampleId, merchant}
        for (Transaction t : repository.findByUser(user)) {
            if (!unsorted(t) || t.getAmount() == null || t.getAmount() >= 0) continue;
            String key = categoryService.normalizeMerchant(t.getMerchant());
            Object[] g = groups.computeIfAbsent(key, k -> new Object[] {
                    com.fintwin.util.MerchantCategorizer.payeeOf(
                            t.getMerchant() == null ? "Unknown" : t.getMerchant()), 0, 0.0, t.getId(), t.getMerchant()});
            g[1] = (int) g[1] + 1;
            g[2] = (double) g[2] - t.getAmount();
        }
        return groups.values().stream()
                .sorted((a, b) -> Double.compare((double) b[2], (double) a[2]))
                .limit(Math.max(1, Math.min(limit, 100)))
                .map(g -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("payee", g[0]);
                    m.put("count", g[1]);
                    m.put("total", Math.round((double) g[2] * 100) / 100.0);
                    m.put("sampleId", g[3]);
                    // exact merchant text, so the page can update matching rows in place
                    m.put("merchant", g[4]);
                    return m;
                })
                .toList();
    }

    /**
     * The local model's suggestion for each payee still in Other (the same
     * payees {@link #unsortedPayees} lists), keyed by normalised merchant.
     * Suggestions only: nothing is recategorised until the user accepts one.
     */
    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    public Map<String, Object> unsortedPayeeSuggestions(int limit) {
        List<String> merchants = unsortedPayees(limit).stream()
                .map(g -> (String) g.get("merchant")).toList();
        CategorySuggestionService.Suggestions s = suggestionService.suggest(merchants);
        return Map.of("suggestions", s.byMerchant(), "complete", s.complete());
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
        return updateCategory(id, category, applyToSimilar, remember, null);
    }

    /**
     * {@code suggested}: the model's suggestion the user was shown for this
     * payee, if any. When it matches what was actually shown, it becomes the
     * prediction the user's choice is recorded against (source LLM) — so the
     * model's accuracy can be measured like any rule's.
     */
    @Caching(evict = {
        @CacheEvict(value = "user-insights",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()"),
        @CacheEvict(value = "user-score",
                    key = "T(com.fintwin.security.SecurityUtils).getCurrentUserEmail()")
    })
    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    @Transactional
    public Map<String, Object> updateCategory(
            Long id, String category, boolean applyToSimilar, boolean remember, String suggested) {

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

        String llm = suggested == null || suggested.isBlank() ? null
                : suggestionService.shown(txn.getMerchant())
                        .filter(s -> s.equalsIgnoreCase(suggested.trim())).orElse(null);
        if (llm != null) markLlmPrediction(txn, llm);
        txn.recordReview(category, false);
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
                        if (llm != null) markLlmPrediction(t, llm);
                        t.recordReview(category, true);
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

    /** The model's suggestion becomes the prediction for a row the rules left in Other. */
    private static void markLlmPrediction(Transaction t, String suggestion) {
        if (t.getCategoryReview() != null || !unsorted(t)) return;
        t.setPredictedCategory(suggestion);
        t.setCategorySource(com.fintwin.util.Categorized.LLM);
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

            ResponseEntity<Map> response;
            try {
                response = aiRestTemplate.postForEntity(
                        aiServiceUrl + "/ocr",
                        requestEntity,
                        Map.class
                );
            } catch (org.springframework.web.client.RestClientException e) {
                // Receipts are read by the AI service, which may be offline for a while
                log.warn("Receipt reader unavailable: {}", e.getClass().getSimpleName());
                throw new com.fintwin.exception.ApiException(HttpStatus.SERVICE_UNAVAILABLE,
                        "Reading receipts needs FinTwin AI, which is offline right now. "
                        + "Add this expense by hand, or try the receipt again later.",
                        "ai_unavailable");
            }

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

            transaction.applyPrediction(categoryService.classify(
                    merchant, categoryService.learnedRulesFor(user), transaction.getAmount()));

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