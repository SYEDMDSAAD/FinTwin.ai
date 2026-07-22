package com.fintwin.service;

import com.fintwin.model.Liability;
import com.fintwin.model.User;
import com.fintwin.repository.LiabilityRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class LiabilityServiceTest {

    @Mock private LiabilityRepository liabilityRepository;
    @Mock private UserRepository userRepository;

    @InjectMocks private LiabilityService service;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        ReflectionTestUtils.setField(user, "id", 1L);
        user.setEmail("test@example.com");

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test@example.com", null, List.of())
        );

        // lenient: validation-failure tests throw before the user lookup
        lenient().when(userRepository.findByEmail("test@example.com"))
                .thenReturn(Optional.of(user));
    }

    // ── loan-field validation (these feed the DTI / credit-score math) ───────

    @Test
    void createLiability_negativeEmiThrows() {
        Liability l = liability("Home Loan", 500000.0);
        l.setEmi(-12000.0);
        assertThatThrownBy(() -> service.createLiability(l))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("EMI");
    }

    @Test
    void createLiability_negativeInterestRateThrows() {
        Liability l = liability("Home Loan", 500000.0);
        l.setInterestRate(-8.5);
        assertThatThrownBy(() -> service.createLiability(l))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("rate");
    }

    @Test
    void createLiability_zeroTermThrows() {
        Liability l = liability("Home Loan", 500000.0);
        l.setTermMonths(0);
        assertThatThrownBy(() -> service.createLiability(l))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("term");
    }

    @Test
    void updateLiability_negativeEmiThrows() {
        Liability patch = liability("Home Loan", 500000.0);
        patch.setEmi(-1.0);
        assertThatThrownBy(() -> service.updateLiability(1L, patch))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("EMI");
    }

    @Test
    void createLiability_nullLoanFieldsAllowed() {
        Liability l = liability("Credit Card", 40000.0);
        org.mockito.Mockito.when(liabilityRepository.save(any()))
                .thenAnswer(inv -> inv.getArgument(0));

        Liability saved = service.createLiability(l);

        assertThat(saved.getAmount()).isEqualTo(40000.0);
        verify(liabilityRepository).save(any());
    }

    @Test
    void createLiability_validLoanFieldsAllowed() {
        Liability l = liability("Car Loan", 300000.0);
        l.setEmi(9500.0);
        l.setInterestRate(9.2);
        l.setTermMonths(36);
        org.mockito.Mockito.when(liabilityRepository.save(any()))
                .thenAnswer(inv -> inv.getArgument(0));

        Liability saved = service.createLiability(l);

        assertThat(saved.getEmi()).isEqualTo(9500.0);
        assertThat(saved.getTermMonths()).isEqualTo(36);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Liability liability(String name, double amount) {
        Liability l = new Liability();
        l.setName(name);
        l.setAmount(amount);
        return l;
    }
}
