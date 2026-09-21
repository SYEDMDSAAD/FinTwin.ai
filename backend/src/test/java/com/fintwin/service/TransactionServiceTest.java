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

    @InjectMocks private TransactionService service;

    private User user;

    @BeforeEach
    void setUp() {
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
        ), "BANK");

        assertThat(result.imported()).isEqualTo(1);
        assertThat(result.skipped()).isEqualTo(2);
    }

    @Test
    void importBatch_keepsRowsWhoseDateParses() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        TransactionService.ImportResult result = service.importBatch(List.of(
                Map.of("date", "2026-01-05", "merchant", "Netflix", "amount", -649.0),
                Map.of("date", "05/01/2026", "merchant", "Swiggy", "amount", -500.0)
        ), "BANK");

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
        service.importBatch(List.of(r), "BANK");

        assertThat(savedRows().get(0).getCategory()).isEqualTo("Food");
    }

    @Test
    void importBatch_keepsARealCategoryFromTheFile() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        Map<String, Object> r = row("2026-09-01", "Zerodha fund transfer", -5000.0);
        r.put("category", "Investments");
        service.importBatch(List.of(r), "BANK");

        assertThat(savedRows().get(0).getCategory()).isEqualTo("Investments");
    }

    @Test
    void importBatch_readsIndianFormattedAmountStrings() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        service.importBatch(List.of(
                row("2026-09-01", "RENT SEPT", "25,000.00 Dr"),
                row("2026-09-01", "NEFT CR ACME PAYROLL", "1,20,000.00 Cr")
        ), "BANK");

        List<Transaction> saved = savedRows();
        assertThat(saved).extracting(Transaction::getAmount).containsExactly(-25_000.0, 120_000.0);
    }

    @Test
    void importBatch_tagsBankStatementRowsWithAStableExternalId() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        service.importBatch(List.of(row("2026-09-01", "UPI/NETFLIX", -649.0)), "BANK");

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
        ), "BANK");

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
        ), "BANK");

        assertThat(result.imported()).isEqualTo(2);
        assertThat(result.duplicates()).isZero();
    }

    @Test
    void importBatch_bankBillPaymentStillCountsWithoutCardData() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        // No card purchases on record: the bill is the only trace of that spending
        service.importBatch(List.of(row("2026-09-05", "CREDIT CARD PAYMENT HDFC", -12_000.0)), "BANK");

        assertThat(savedRows().get(0).getCategory()).isNotEqualTo(TransactionMath.CARD_PAYMENT_CATEGORY);
    }

    @Test
    void importBatch_bankBillPaymentExcludedOnceCardDataExists() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(repository.countByUserAndSource(user, "CARD")).thenReturn(40L);

        service.importBatch(List.of(row("2026-09-05", "CREDIT CARD PAYMENT HDFC", -12_000.0)), "BANK");

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
        ), "CARD");

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

        service.importBatch(List.of(row("2026-09-03", "AMAZON PAY INDIA", "2,499.00 Dr")), "CARD");

        // Otherwise the bill and the purchases it paid for both count as spending
        assertThat(oldBill.getCategory()).isEqualTo(TransactionMath.CARD_PAYMENT_CATEGORY);
        verify(repository).saveAll(List.of(oldBill));
    }
}
