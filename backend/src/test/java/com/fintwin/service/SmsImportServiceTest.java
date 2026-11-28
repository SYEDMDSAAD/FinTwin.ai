package com.fintwin.service;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.util.Categorized;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Made-up messages in the shape Indian banks send. */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SmsImportServiceTest {

    private static final long NOV_24 = LocalDate.of(2026, 11, 24)
            .atTime(14, 5).atZone(ZoneId.of("Asia/Kolkata")).toInstant().toEpochMilli();

    @Mock private UserRepository users;
    @Mock private TransactionRepository transactions;
    @Mock private CategoryService categories;

    private SmsImportService service;
    private final User user = new User();
    private final List<Transaction> saved = new ArrayList<>();

    @BeforeEach
    void setUp() {
        org.springframework.test.util.ReflectionTestUtils.setField(user, "id", 7L);
        user.setEmail("sample@example.com");
        service = new SmsImportService(users,
                new AlertImporter(transactions, categories, new ConcurrentMapCacheManager()));
        when(transactions.findByUserAndExternalId(any(), anyString())).thenReturn(Optional.empty());
        when(transactions.findSince(anyLong(), any())).thenReturn(List.of());
        when(categories.learnedRulesFor(any())).thenReturn(Map.of());
        when(categories.classify(anyString(), anyMap(), any())).thenReturn(new Categorized("Food", "RULE"));
        when(transactions.save(any())).thenAnswer(i -> { Transaction t = i.getArgument(0); saved.add(t); return t; });
    }

    private SmsImportService.Result run(String sender, String body) {
        return service.importFor(user, List.of(new SmsImportService.Sms(sender, body, NOV_24)));
    }

    @Test
    void importsAUpiDebit() {
        var r = run("VM-HDFCBK", "Sent Rs.450.00 From HDFC Bank A/C *4321 To SWIGGY On 24/11/26 "
                + "Ref 432112345678 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808");
        assertThat(r.imported()).isEqualTo(1);
        Transaction t = saved.get(0);
        assertThat(t.getAmount()).isEqualTo(-450.0);
        assertThat(t.getSource()).isEqualTo("SMS");
        assertThat(t.getAccountRef()).isEqualTo("HDFC ··4321");
        assertThat(t.getExternalId()).startsWith("SMS:");
        assertThat(t.getDate()).isEqualTo(LocalDate.of(2026, 11, 24));
    }

    @Test
    void importsACredit() {
        var r = run("AD-ICICIT-S", "Dear Customer, Acct XX789 is credited with Rs 52,000.00 on 01-Nov-26 "
                + "from EMPLOYER PVT LTD. UPI:432100001111-ICICI Bank.");
        assertThat(r.imported()).isEqualTo(1);
        assertThat(saved.get(0).getAmount()).isEqualTo(52000.0);
    }

    @Test
    void readsSbiAlertsThatGiveTheAmountWithoutRupees() {
        var r = run("JD-SBIINB-T", "Dear UPI user A/C X5678 debited by 250.0 on date 24Nov26 trf to ZOMATO "
                + "Refno 432198765432. If not u? call 1800111109. -SBI");
        assertThat(r.imported()).isEqualTo(1);
        assertThat(saved.get(0).getAmount()).isEqualTo(-250.0);
        assertThat(saved.get(0).getAccountRef()).isEqualTo("SBI ··5678");
    }

    @Test
    void sbiUpiDebitToAMultiWordMerchant() {
        var r = run("JD-SBIUPI-S", "Dear UPI user A/C X1234 debited by 17102.00 on date 24Nov26 trf to Trip com "
                + "Refno 600011112222 If not u? call-1800111109 for other services-18001234-SBI");
        assertThat(r.imported()).isEqualTo(1);
        Transaction t = saved.get(0);
        assertThat(t.getAmount()).isEqualTo(-17102.0);
        assertThat(t.getMerchant()).isEqualTo("Trip com");
        assertThat(t.getAccountRef()).isEqualTo("SBI ··1234");
        assertThat(t.getDate()).isEqualTo(LocalDate.of(2026, 11, 24));
    }

    @Test
    void refusesUpiCollectRequestsNotYetApproved() {
        // From a bank header too, in case a bank ever relays one
        var r = run("VM-SBIUPI", "Trip com has requested money from you on PhonePe.Rs.17102 will be debited "
                + "from your account on approving the request - https://phone.pe/PHONPE/abcdefgh");
        assertThat(r.imported()).isZero();
        assertThat(saved).isEmpty();
    }

    @Test
    void refusesOtpsBalancesAndFailedPayments() {
        var r = service.importFor(user, List.of(
                new SmsImportService.Sms("VM-HDFCBK", "123456 is the OTP for txn of Rs 999.00 at AMAZON on HDFC Bank Card x1234. Do not share.", NOV_24),
                new SmsImportService.Sms("VM-AXISBK", "Your A/c no. XX1234 has Avl Bal of Rs 12,000.00 as on 24-11-26.", NOV_24),
                new SmsImportService.Sms("VM-KOTAKB", "Payment of Rs 500 to ACME failed. Amount will not be debited.", NOV_24)));
        assertThat(r.notTransaction()).isEqualTo(3);
        assertThat(r.imported()).isZero();
        verify(transactions, never()).save(any());
    }

    @Test
    void ignoresMessagesThatAreNotFromABank() {
        var r = service.importFor(user, List.of(
                new SmsImportService.Sms("+919876543210", "Sent Rs 500 to you, return it tomorrow", NOV_24),
                new SmsImportService.Sms("VM-SWIGGY", "Your order of Rs 450 is on the way", NOV_24)));
        assertThat(r.notBank()).isEqualTo(2);
        assertThat(r.unknownSenders()).containsExactly("SWIGGY");
        verify(transactions, never()).save(any());
    }

    @Test
    void theSameMessageTwiceIsImportedOnce() {
        String body = "Sent Rs.450.00 From HDFC Bank A/C *4321 To SWIGGY On 24/11/26 Ref 432112345678";
        run("VM-HDFCBK", body);
        ArgumentCaptor<String> id = ArgumentCaptor.forClass(String.class);
        verify(transactions).findByUserAndExternalId(eq(user), id.capture());
        when(transactions.findByUserAndExternalId(user, id.getValue())).thenReturn(Optional.of(new Transaction()));

        var again = run("BZ-HDFCBK-S", body);   // another operator prefix, same sender code
        assertThat(again.duplicates()).isEqualTo(1);
        assertThat(saved).hasSize(1);
    }

    @Test
    void moneyAlreadyOnRecordFromAStatementIsNotCountedTwice() {
        Transaction fromStatement = new Transaction();
        fromStatement.setAmount(-450.0);
        fromStatement.setDate(LocalDate.of(2026, 11, 24));
        when(transactions.findSince(anyLong(), any())).thenReturn(List.of(fromStatement));

        var r = run("VM-HDFCBK", "Sent Rs.450.00 From HDFC Bank A/C *4321 To SWIGGY On 24/11/26");
        assertThat(r.onRecord()).isEqualTo(1);
        verify(transactions, never()).save(any());
    }

    @Test
    void twoSmsForTheSameAmountOnOneDayAreTwoPayments() {
        // The first ₹20 chai, already saved from an earlier SMS
        Transaction firstChai = new Transaction();
        firstChai.setAmount(-20.0);
        firstChai.setDate(LocalDate.of(2026, 11, 24));
        firstChai.setExternalId(SmsImportService.EXTERNAL_ID_PREFIX + "earlier");
        when(transactions.findSince(anyLong(), any())).thenReturn(List.of(firstChai));

        var r = run("VM-HDFCBK", "Sent Rs.20.00 From HDFC Bank A/C *4321 To TEA STALL On 24/11/26");
        assertThat(r.imported()).isEqualTo(1);
        assertThat(r.onRecord()).isZero();
    }

    @Test
    void anOversizedBatchIsRefused() {
        var many = new ArrayList<SmsImportService.Sms>();
        for (int i = 0; i <= SmsImportService.MAX_MESSAGES; i++) many.add(new SmsImportService.Sms("VM-HDFCBK", "x", NOV_24));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.importMessages(many))
                .hasMessageContaining("At most");
    }
}
