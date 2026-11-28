package com.fintwin.service;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.util.Categorized;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.test.util.ReflectionTestUtils;
import com.fintwin.exception.ApiException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SmsShortcutServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final TransactionRepository transactions = mock(TransactionRepository.class);
    private final CategoryService categories = mock(CategoryService.class);
    private final List<Transaction> saved = new ArrayList<>();
    private SmsShortcutService service;
    private User user;

    @BeforeEach
    void setUp() {
        AlertImporter importer = new AlertImporter(transactions, categories, mock(CacheManager.class));
        service = new SmsShortcutService(users, new SmsImportService(users, importer), "test-secret-that-is-long-enough");
        user = new User();
        ReflectionTestUtils.setField(user, "id", 7L);
        user.setEmail("iphone@example.com");
        user.setIngestToken("0123456789abcdef0123");
        when(users.findById(7L)).thenReturn(Optional.of(user));
        when(transactions.findByUserAndExternalId(any(), anyString())).thenReturn(Optional.empty());
        when(transactions.findSince(anyLong(), any())).thenReturn(List.of());
        when(categories.classify(anyString(), anyMap(), any())).thenReturn(new Categorized("Travel", "RULE"));
        when(transactions.save(any())).thenAnswer(i -> { Transaction t = i.getArgument(0); saved.add(t); return t; });
    }

    private static final String SBI = "Dear UPI user A/C X1234 debited by 17102.00 on date 25Nov26 trf to Trip com "
            + "Refno 600011112222 If not u? call-1800111109 for other services-18001234-SBI";

    @Test
    void aSignedMessageIsImported() {
        var r = service.importOne(service.keyFor(user), "JD-SBIUPI-S", SBI, null);
        assertThat(r.imported()).isEqualTo(1);
        assertThat(saved.get(0).getAmount()).isEqualTo(-17102.0);
        assertThat(saved.get(0).getSource()).isEqualTo("SMS");
    }

    @Test
    void withoutASenderTheBanksSignatureIsEnough() {
        assertThat(service.importOne(service.keyFor(user), null, SBI, null).imported()).isEqualTo(1);
        assertThat(saved.get(0).getAccountRef()).isEqualTo("SBI ··1234");
    }

    @Test
    void aRequestToPayIsNotAPayment() {
        var r = service.importOne(service.keyFor(user), "PhonePe",
                "Trip com has requested money from you on PhonePe.Rs.17102 will be debited from your account on approving the request", null);
        assertThat(r.imported()).isZero();
        assertThat(saved).isEmpty();
    }

    @Test
    void aWrongOrOldKeyIsRefused() {
        String key = service.keyFor(user);
        String tampered = key.substring(0, key.length() - 1) + (key.endsWith("A") ? "B" : "A");
        assertThatThrownBy(() -> service.importOne(tampered, null, SBI, null))
                .isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.importOne("ft1.8." + key.split("\\.")[2], null, SBI, null))
                .isInstanceOf(ApiException.class);
        user.setIngestToken("ffffffffffffffffffff");          // rotated
        assertThatThrownBy(() -> service.importOne(key, null, SBI, null)).isInstanceOf(ApiException.class);
        assertThatThrownBy(() -> service.importOne(null, null, SBI, null)).isInstanceOf(ApiException.class);
        assertThat(saved).isEmpty();
    }

    @Test
    void theDemoAccountTakesNothing() {
        user.setRole("DEMO");
        assertThatThrownBy(() -> service.importOne(service.keyFor(user), null, SBI, null))
                .isInstanceOf(ApiException.class);
    }
}
