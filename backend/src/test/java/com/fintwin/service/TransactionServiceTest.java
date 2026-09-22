package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Transaction;
import com.fintwin.util.StatementImport;
import com.fintwin.util.TransactionMath;

import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TransactionServiceTest {

    @Mock private TransactionRepository repository;
    @Mock private CategoryService categoryService;
    @Mock private ExpenseParserService parserService;
    @Mock private UserRepository userRepository;
    @Mock private ProfileService profileService;
    @Mock private RestTemplate aiRestTemplate;
    @Mock private CategorySuggestionService suggestionService;

    @InjectMocks private TransactionService service;

    private User user;

    @BeforeEach
    void setUp() {
        // The service calls classify(); these tests stub categorize(), so route
        // one to the other (anything unstubbed is Other, as before).
        org.mockito.Mockito.lenient().when(categoryService.classify(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
                .thenAnswer(inv -> {
                    String c = categoryService.categorize(inv.getArgument(0), inv.getArgument(1));
                    return c == null ? com.fintwin.util.Categorized.other()
                            : new com.fintwin.util.Categorized(c, com.fintwin.util.Categorized.BRAND);
                });

        user = new User();
        ReflectionTestUtils.setField(user, "id", 1L);
        user.setEmail("test@example.com");

        ReflectionTestUtils.setField(service, "aiServiceUrl", "http://localhost:8000");

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test@example.com", null, List.of())
        );
    }

    // ── uploadCSV — file type validation ─────────────────────────────────────

    @Test
    void uploadCSV_rejectsNullContentType() {
        MockMultipartFile file = new MockMultipartFile("file", "data.csv", null, new byte[]{});
        assertThatThrownBy(() -> service.uploadCSV(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid file type");
    }

    @Test
    void uploadCSV_rejectsNonCsvContentType() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "evil.pdf", "application/pdf", new byte[]{1, 2, 3});
        assertThatThrownBy(() -> service.uploadCSV(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Only CSV files are accepted");
    }

    @Test
    void uploadCSV_rejectsFileLargerThan5MB() {
        byte[] bigFile = new byte[5 * 1024 * 1024 + 1];
        MockMultipartFile file = new MockMultipartFile(
                "file", "big.csv", "text/csv", bigFile);
        assertThatThrownBy(() -> service.uploadCSV(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("too large");
    }

    @Test
    void uploadCSV_acceptsTextCsvContentType() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        String csv = "date,merchant,amount\n2026-01-01,Swiggy,-500.0\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        when(categoryService.categorize(eq("Swiggy"), any())).thenReturn("Food");

        // Should not throw
        service.uploadCSV(file);
    }

    @Test
    void uploadCSV_acceptsApplicationCsvContentType() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        String csv = "date,merchant,amount\n2026-01-01,Amazon,-1200.0\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "application/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        when(categoryService.categorize(eq("Amazon"), any())).thenReturn("Shopping");

        service.uploadCSV(file);
    }

    @Test
    void uploadCSV_skipsRowsWithInsufficientColumns() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        // Row 1 has only 2 columns — should be skipped without throwing
        String csv = "date,merchant\n2026-01-01,Swiggy\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        service.uploadCSV(file);
    }

    // ── updateCategory — manual recategorization + learned rule ──────────────

    private Transaction ownedTxn(Long id, String merchant, String category) {
        Transaction t = new Transaction();
        ReflectionTestUtils.setField(t, "id", id);
        t.setMerchant(merchant);
        t.setCategory(category);
        t.setAmount(-500.0);
        t.setDate(java.time.LocalDate.of(2026, 7, 1));
        t.setUser(user);
        return t;
    }

    @Test
    void updateCategory_updatesTransactionAndRemembersRule() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction txn = ownedTxn(5L, "SHARMA GENERAL STORE", "Other");
        when(repository.findById(5L)).thenReturn(Optional.of(txn));

        Map<String, Object> result =
                service.updateCategory(5L, "Groceries", false, true);

        assertThat(txn.getCategory()).isEqualTo("Groceries");
        assertThat(result.get("similarUpdated")).isEqualTo(0);
        verify(categoryService).rememberRule(user, "SHARMA GENERAL STORE", "Groceries");
        verify(repository).save(txn);
    }

    @Test
    void updateCategory_acceptingTheShownSuggestionRecordsItAsAConfirmedLlmPrediction() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction txn     = ownedTxn(5L, "Paid to DECATHLON SPORTS", "Other");
        Transaction similar = ownedTxn(6L, "paid to decathlon sports", "Other");
        txn.applyPrediction(com.fintwin.util.Categorized.other());
        similar.applyPrediction(com.fintwin.util.Categorized.other());
        when(repository.findById(5L)).thenReturn(Optional.of(txn));
        when(repository.findByUser(user)).thenReturn(List.of(txn, similar));
        when(categoryService.normalizeMerchant(anyString())).thenAnswer(
                inv -> inv.getArgument(0, String.class).toLowerCase().trim());
        when(suggestionService.shown("Paid to DECATHLON SPORTS")).thenReturn(Optional.of("Shopping"));

        service.updateCategory(5L, "Shopping", true, true, "Shopping");

        assertThat(txn.getCategorySource()).isEqualTo(com.fintwin.util.Categorized.LLM);
        assertThat(txn.getPredictedCategory()).isEqualTo("Shopping");
        assertThat(txn.getCategoryReview()).isEqualTo(com.fintwin.util.Categorized.CONFIRMED);
        assertThat(similar.getCategorySource()).isEqualTo(com.fintwin.util.Categorized.LLM);
        assertThat(similar.getCategoryReview()).isEqualTo(com.fintwin.util.Categorized.APPLIED);
    }

    @Test
    void updateCategory_changingTheSuggestionIsACorrectionOfTheModel() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction txn = ownedTxn(5L, "Paid to Urban Company", "Other");
        txn.applyPrediction(com.fintwin.util.Categorized.other());
        when(repository.findById(5L)).thenReturn(Optional.of(txn));
        when(suggestionService.shown("Paid to Urban Company")).thenReturn(Optional.of("Groceries"));

        service.updateCategory(5L, "Housing", false, true, "Groceries");

        assertThat(txn.getPredictedCategory()).isEqualTo("Groceries");
        assertThat(txn.getCategoryReview()).isEqualTo(com.fintwin.util.Categorized.CORRECTED);
    }

    @Test
    void updateCategory_ignoresASuggestionThatWasNeverShown() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction txn = ownedTxn(5L, "Paid to SARA ENTERPRISES", "Other");
        txn.applyPrediction(com.fintwin.util.Categorized.other());
        when(repository.findById(5L)).thenReturn(Optional.of(txn));
        when(suggestionService.shown("Paid to SARA ENTERPRISES")).thenReturn(Optional.empty());

        service.updateCategory(5L, "Groceries", false, true, "Groceries");

        assertThat(txn.getCategorySource()).isEqualTo(com.fintwin.util.Categorized.NONE);
        assertThat(txn.getPredictedCategory()).isEqualTo("Other");
    }

    @Test
    void updateCategory_skipsRuleWhenRememberFalse() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction txn = ownedTxn(5L, "SHARMA GENERAL STORE", "Other");
        when(repository.findById(5L)).thenReturn(Optional.of(txn));

        service.updateCategory(5L, "Groceries", false, false);

        verify(categoryService, never()).rememberRule(any(), anyString(), anyString());
    }

    @Test
    void updateCategory_appliesToSimilarPastTransactions() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction txn     = ownedTxn(5L, "SHARMA GENERAL STORE", "Other");
        Transaction similar = ownedTxn(6L, "Sharma General Store",  "Other");
        Transaction other   = ownedTxn(7L, "Zomato Order",          "Food");
        when(repository.findById(5L)).thenReturn(Optional.of(txn));
        when(repository.findByUser(user)).thenReturn(List.of(txn, similar, other));
        when(categoryService.normalizeMerchant(anyString())).thenAnswer(
                inv -> inv.getArgument(0, String.class).toLowerCase().trim());

        Map<String, Object> result =
                service.updateCategory(5L, "Groceries", true, true);

        assertThat(result.get("similarUpdated")).isEqualTo(1);
        assertThat(similar.getCategory()).isEqualTo("Groceries");
        assertThat(other.getCategory()).isEqualTo("Food");
    }

    @Test
    void updateCategory_rejectsOtherUsersTransaction() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        User stranger = new User();
        ReflectionTestUtils.setField(stranger, "id", 2L);
        Transaction txn = ownedTxn(5L, "SHARMA GENERAL STORE", "Other");
        txn.setUser(stranger);
        when(repository.findById(5L)).thenReturn(Optional.of(txn));

        assertThatThrownBy(() -> service.updateCategory(5L, "Groceries", false, true))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void updateCategory_rejectsBlankCategory() {
        assertThatThrownBy(() -> service.updateCategory(5L, "  ", false, true))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("must not be empty");
    }

    @Test
    void uploadCSV_skipsRowsWithInvalidAmount() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        // amount is not a number — row should be silently skipped
        String csv = "date,merchant,amount\n2026-01-01,Swiggy,INVALID\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        service.uploadCSV(file);
    }

    // ── importBatch — a row's date is never fabricated ───────────────────────

    @Test
    void importBatch_skipsRowsWithNoDateRatherThanStampingThemToday() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        // Dating an undated row "today" piles whole batches onto the import
        // date and corrupts every month-based figure built on top of it.
        TransactionService.ImportResult result = service.importBatch(List.of(
                Map.of("merchant", "Swiggy", "amount", -500.0),
                Map.of("date", "not-a-date", "merchant", "Uber", "amount", -300.0),
                Map.of("date", "2026-01-05", "merchant", "Netflix", "amount", -649.0)
        ), "BANK", null);

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skipped()).isEqualTo(2);
    }

    @Test
    void importBatch_keepsRowsWhoseDateParses() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        TransactionService.ImportResult result = service.importBatch(List.of(
                Map.of("date", "2026-01-05", "merchant", "Netflix", "amount", -649.0),
                Map.of("date", "05/01/2026", "merchant", "Swiggy", "amount", -500.0)
        ), "BANK", null);

        assertThat(result.imported()).isEqualTo(2);
    }

    // ── importBatch — statements ─────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private List<Transaction> savedRows() {
        ArgumentCaptor<List<Transaction>> captor = ArgumentCaptor.forClass(List.class);
        verify(repository, atLeastOnce()).saveAll(captor.capture());
        return captor.getAllValues().get(0);
    }

    private static Map<String, Object> row(String date, String merchant, Object amount) {
        Map<String, Object> m = new HashMap<>();
        m.put("date", date);
        m.put("merchant", merchant);
        m.put("amount", amount);
        return m;
    }

    @Test
    void importBatch_placeholderCategoryDoesNotBlockAutoCategorisation() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(categoryService.categorize(eq("UPI/SWIGGY"), any())).thenReturn("Food");

        // The import page used to send "Others" for every unmapped row, which
        // the service took as a real category — every statement landed there.
        Map<String, Object> r = row("2026-09-01", "UPI/SWIGGY", -450.0);
        r.put("category", "Others");
        service.importBatch(List.of(r), "BANK", null);

        assertThat(savedRows().get(0).getCategory()).isEqualTo("Food");
    }

    @Test
    void importBatch_keepsARealCategoryFromTheFile() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        Map<String, Object> r = row("2026-09-01", "Zerodha fund transfer", -5000.0);
        r.put("category", "Investments");
        service.importBatch(List.of(r), "BANK", null);

        assertThat(savedRows().get(0).getCategory()).isEqualTo("Investments");
    }

    @Test
    void importBatch_readsIndianFormattedAmountStrings() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        service.importBatch(List.of(
                row("2026-09-01", "RENT SEPT", "25,000.00 Dr"),
                row("2026-09-01", "NEFT CR ACME PAYROLL", "1,20,000.00 Cr")
        ), "BANK", null);

        List<Transaction> saved = savedRows();
        assertThat(saved).extracting(Transaction::getAmount).containsExactly(-25_000.0, 120_000.0);
    }

    @Test
    void importBatch_tagsBankStatementRowsWithAStableExternalId() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        service.importBatch(List.of(row("2026-09-01", "UPI/NETFLIX", -649.0)), "BANK", null);

        Transaction t = savedRows().get(0);
        assertThat(t.getSource()).isEqualTo("STATEMENT");
        assertThat(t.getExternalId()).isEqualTo(
                StatementImport.externalId(java.time.LocalDate.of(2026, 9, 1), -649.0, "UPI/NETFLIX", null, 0));
    }

    @Test
    void importBatch_skipsRowsAlreadyImported() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        String alreadyThere = StatementImport.externalId(
                java.time.LocalDate.of(2026, 9, 1), -649.0, "UPI/NETFLIX", null, 0);
        when(repository.findExternalIdsByUser(user)).thenReturn(Set.of(alreadyThere));

        TransactionService.ImportResult result = service.importBatch(List.of(
                row("2026-09-01", "UPI/NETFLIX", -649.0),
                row("2026-09-02", "UPI/SWIGGY", -300.0)
        ), "BANK", null);

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.duplicates()).isEqualTo(1);
        assertThat(savedRows()).extracting(Transaction::getMerchant).containsExactly("UPI/SWIGGY");
    }

    @Test
    void importBatch_keepsIdenticalSameDayRowsAsSeparateTransactions() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        TransactionService.ImportResult result = service.importBatch(List.of(
                row("2026-09-01", "UPI/CHAI POINT", -20.0),
                row("2026-09-01", "UPI/CHAI POINT", -20.0)
        ), "BANK", null);

        assertThat(result.imported()).isEqualTo(2);
        assertThat(result.duplicates()).isZero();
    }

    @Test
    void importBatch_bankBillPaymentStillCountsWithoutCardData() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        // No card purchases on record: the bill is the only trace of that spending
        service.importBatch(List.of(row("2026-09-05", "CREDIT CARD PAYMENT HDFC", -12_000.0)), "BANK", null);

        assertThat(savedRows().get(0).getCategory()).isNotEqualTo(TransactionMath.CARD_PAYMENT_CATEGORY);
    }

    @Test
    void importBatch_bankBillPaymentExcludedOnceCardDataExists() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(repository.countByUserAndSource(user, "CARD")).thenReturn(40L);

        service.importBatch(List.of(row("2026-09-05", "CREDIT CARD PAYMENT HDFC", -12_000.0)), "BANK", null);

        assertThat(savedRows().get(0).getCategory()).isEqualTo(TransactionMath.CARD_PAYMENT_CATEGORY);
    }

    @Test
    void importBatch_cardStatementSeparatesPurchasesRepaymentsAndRefunds() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(categoryService.categorize(eq("AMAZON PAY INDIA"), any())).thenReturn("Shopping");

        service.importBatch(List.of(
                row("2026-09-03", "AMAZON PAY INDIA", "2,499.00 Dr"),
                row("2026-09-10", "PAYMENT RECEIVED - THANK YOU", "12,000.00 Cr"),
                row("2026-09-12", "REFUND AMAZON PAY INDIA", "499.00 Cr")
        ), "CARD", null);

        List<Transaction> saved = savedRows();
        assertThat(saved).extracting(Transaction::getSource).containsOnly("CARD");
        assertThat(saved).extracting(Transaction::getCategory)
                .containsExactly("Shopping", TransactionMath.CARD_PAYMENT_CATEGORY, "Other");
    }

    @Test
    void importBatch_cardStatementRestampsBillPaymentsAlreadyOnRecord() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction oldBill = new Transaction();
        oldBill.setAmount(-12_000.0);
        oldBill.setMerchant("CREDIT CARD PAYMENT HDFC");
        oldBill.setCategory("Other");
        oldBill.setSource("STATEMENT");
        when(repository.findByUser(user)).thenReturn(List.of(oldBill));

        service.importBatch(List.of(row("2026-09-03", "AMAZON PAY INDIA", "2,499.00 Dr")), "CARD", null);

        // Otherwise the bill and the purchases it paid for both count as spending
        assertThat(oldBill.getCategory()).isEqualTo(TransactionMath.CARD_PAYMENT_CATEGORY);
        verify(repository).saveAll(List.of(oldBill));
    }

    // ── importBatch — statements take over alert-email transactions ──────────

    private static Transaction fromAlertEmail(double amount, String date, String accountRef) {
        Transaction t = new Transaction();
        t.setAmount(amount);
        t.setDate(java.time.LocalDate.parse(date));
        t.setMerchant("NETFLIX");
        t.setCategory("Entertainment");
        t.setSource(InboundEmailService.SOURCE_EMAIL);
        t.setExternalId(InboundEmailService.EXTERNAL_ID_PREFIX + "abc");
        t.setAccountRef(accountRef);
        return t;
    }

    @Test
    void importBatch_statementRowTakesOverTheAlertEmailInsteadOfDoublingIt() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction alert = fromAlertEmail(-649.0, "2026-09-21", "HDFC ··1234");
        when(repository.findByUser(user)).thenReturn(List.of(alert));

        // posted a day later, as statements often are, under the user's own label
        TransactionService.ImportResult result = service.importBatch(
                List.of(row("2026-09-22", "UPI/DR/412345/NETFLIX", -649.0)), "BANK", "HDFC Savings ··1234");

        assertThat(result.imported()).isZero();
        assertThat(result.reconciled()).isEqualTo(1);
        assertThat(alert.getExternalId()).startsWith(StatementImport.EXTERNAL_ID_PREFIX);
        assertThat(alert.getSource()).isEqualTo("STATEMENT");
        assertThat(alert.getDate()).isEqualTo(java.time.LocalDate.of(2026, 9, 22));
        // what the user saw (and may have corrected) stays
        assertThat(alert.getMerchant()).isEqualTo("NETFLIX");
        assertThat(alert.getCategory()).isEqualTo("Entertainment");
        verify(repository).saveAll(List.of(alert));
    }

    @Test
    void importBatch_anAlertFromADifferentAccountIsNotTakenOver() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(repository.findByUser(user)).thenReturn(List.of(fromAlertEmail(-649.0, "2026-09-21", "HDFC ··1234")));

        TransactionService.ImportResult result = service.importBatch(
                List.of(row("2026-09-21", "NETFLIX", -649.0)), "BANK", "ICICI ··9876");

        assertThat(result.reconciled()).isZero();
        assertThat(result.imported()).isEqualTo(1);
    }

    @Test
    void importBatch_aBankRowNeverTakesOverACardAlert() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction cardAlert = fromAlertEmail(-649.0, "2026-09-21", null);
        cardAlert.setSource("CARD");
        when(repository.findByUser(user)).thenReturn(List.of(cardAlert));

        TransactionService.ImportResult result = service.importBatch(
                List.of(row("2026-09-21", "NETFLIX", -649.0)), "BANK", null);

        assertThat(result.reconciled()).isZero();
    }

    @Test
    void importBatch_storesTheAccountLabelOnEveryRow() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        service.importBatch(List.of(row("2026-09-01", "UPI/SWIGGY", -450.0)), "BANK", "  HDFC   ··1234 ");

        assertThat(savedRows().get(0).getAccountRef()).isEqualTo("HDFC ··1234");
    }

    // ── re-sorting "Other" ───────────────────────────────────────────────────

    private static Transaction txn(long id, String merchant, double amount, String category) {
        Transaction t = new Transaction();
        ReflectionTestUtils.setField(t, "id", id);
        t.setMerchant(merchant);
        t.setAmount(amount);
        t.setCategory(category);
        t.setSource("STATEMENT");
        return t;
    }

    @Test
    void recategorizeUnsorted_sortsOtherButNeverTouchesAUsersChoice() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        Transaction bakery = txn(1, "Paid to Noor bakery", -60, "Other");
        Transaction chosen = txn(2, "Paid to Noor bakery", -60, "Groceries");   // user set this
        Transaction unknown = txn(3, "Paid to SARA ENTERPRISES", -320, "Other");
        when(repository.findByUser(user)).thenReturn(List.of(bakery, chosen, unknown));
        when(categoryService.categorize(eq("Paid to Noor bakery"), any())).thenReturn("Food");
        when(categoryService.categorize(eq("Paid to SARA ENTERPRISES"), any())).thenReturn("Other");

        Map<String, Object> result = service.recategorizeUnsorted();

        assertThat(result).containsEntry("updated", 1).containsEntry("remaining", 1);
        assertThat(bakery.getCategory()).isEqualTo("Food");
        assertThat(chosen.getCategory()).isEqualTo("Groceries");
        verify(repository).saveAll(List.of(bakery));
    }

    @Test
    void unsortedPayees_groupsWhatIsLeftBiggestSpendFirst() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(categoryService.normalizeMerchant(any())).thenAnswer(i -> ((String) i.getArgument(0)).toLowerCase());
        when(repository.findByUser(user)).thenReturn(List.of(
                txn(1, "Paid to SARA ENTERPRISES", -320, "Other"),
                txn(2, "Paid to SARA ENTERPRISES", -80, "Other"),
                txn(3, "Paid to OTT commerce", -999, "Other"),
                txn(4, "Paid to Noor bakery", -60, "Food"),         // sorted already
                txn(5, "Received from ******1317", 500, "Other")));  // money in: not spending

        List<Map<String, Object>> groups = service.unsortedPayees(30);

        assertThat(groups).extracting(g -> g.get("payee")).containsExactly("OTT commerce", "SARA ENTERPRISES");
        assertThat(groups.get(1)).containsEntry("count", 2).containsEntry("total", 400.0).containsEntry("sampleId", 1L)
                .containsEntry("merchant", "Paid to SARA ENTERPRISES");
    }
}

