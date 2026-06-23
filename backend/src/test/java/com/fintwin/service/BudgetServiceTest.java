package com.fintwin.service;

import com.fintwin.dto.BudgetStatusDTO;
import com.fintwin.model.Budget;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.TransactionRepository;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BudgetServiceTest {

    @Mock private BudgetRepository budgetRepository;
    @Mock private TransactionRepository transactionRepository;
    @Mock private UserRepository userRepository;
    @Mock private ProfileService profileService;

    @InjectMocks private BudgetService service;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        ReflectionTestUtils.setField(user, "id", 1L);
        user.setEmail("test@example.com");

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test@example.com", null, List.of())
        );

        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
    }

    // ── createBudget ─────────────────────────────────────────────────────────

    @Test
    void createBudget_blankCategoryThrows() {
        Budget b = budget("", 1000.0);
        assertThatThrownBy(() -> service.createBudget(b))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("category");
    }

    @Test
    void createBudget_nullCategoryThrows() {
        Budget b = budget(null, 1000.0);
        assertThatThrownBy(() -> service.createBudget(b))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void createBudget_zeroLimitThrows() {
        Budget b = budget("Food", 0.0);
        assertThatThrownBy(() -> service.createBudget(b))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("limit");
    }

    @Test
    void createBudget_negativeLimitThrows() {
        Budget b = budget("Food", -500.0);
        assertThatThrownBy(() -> service.createBudget(b))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void createBudget_duplicateCategoryThrows() {
        Budget existing = budget("Food", 5000.0);
        existing.setUser(user);
        when(budgetRepository.findByUser(user)).thenReturn(List.of(existing));

        assertThatThrownBy(() -> service.createBudget(budget("food", 3000.0)))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("already exists");
    }

    @Test
    void createBudget_categorizationIsCaseInsensitive() {
        Budget existing = budget("FOOD", 5000.0);
        existing.setUser(user);
        when(budgetRepository.findByUser(user)).thenReturn(List.of(existing));

        assertThatThrownBy(() -> service.createBudget(budget("food", 1000.0)))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void createBudget_capitalizesCategory() {
        when(budgetRepository.findByUser(user)).thenReturn(List.of());
        Budget saved = budget("Food", 3000.0);
        saved.setUser(user);
        when(budgetRepository.save(any())).thenReturn(saved);

        Budget input = budget("food", 3000.0);
        service.createBudget(input);

        assertThat(input.getCategory()).isEqualTo("Food");
    }

    @Test
    void createBudget_savesAndSnapshotsScore() {
        when(budgetRepository.findByUser(user)).thenReturn(List.of());
        Budget saved = budget("Transport", 2000.0);
        saved.setUser(user);
        when(budgetRepository.save(any())).thenReturn(saved);

        service.createBudget(budget("Transport", 2000.0));

        verify(budgetRepository).save(any());
        verify(profileService).saveScoreSnapshot(user);
    }

    // ── deleteBudget ─────────────────────────────────────────────────────────

    @Test
    void deleteBudget_unauthorizedUserThrows() {
        User other = new User();
        ReflectionTestUtils.setField(other, "id", 99L);

        Budget b = budget("Food", 3000.0);
        b.setId(1L);
        b.setUser(other);

        when(budgetRepository.findById(1L)).thenReturn(Optional.of(b));

        assertThatThrownBy(() -> service.deleteBudget(1L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("Unauthorized");
    }

    @Test
    void deleteBudget_notFoundThrows() {
        when(budgetRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.deleteBudget(999L))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void deleteBudget_ownerCanDelete() {
        Budget b = budget("Food", 3000.0);
        b.setId(1L);
        b.setUser(user);
        when(budgetRepository.findById(1L)).thenReturn(Optional.of(b));

        service.deleteBudget(1L);

        verify(budgetRepository).delete(b);
        verify(profileService).saveScoreSnapshot(user);
    }

    // ── getBudgetStatus ───────────────────────────────────────────────────────

    @Test
    void getBudgetStatus_calculatesSpentFromNegativeTransactions() {
        Budget food = budget("Food", 5000.0);
        food.setId(1L);
        food.setUser(user);
        when(budgetRepository.findByUser(user)).thenReturn(List.of(food));

        when(transactionRepository.findLatestThreeMonthsTransactions(1L))
                .thenReturn(List.of(
                        txn("Food", -1500.0),
                        txn("Food", -800.0),
                        txn("Food", 200.0)   // income — should NOT count as spend
                ));

        List<BudgetStatusDTO> result = service.getBudgetStatus();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getSpent()).isEqualTo(2300.0);
        assertThat(result.get(0).getRemaining()).isEqualTo(2700.0);
        assertThat(result.get(0).getExceeded()).isFalse();
    }

    @Test
    void getBudgetStatus_exceededFlagTrueWhenOverLimit() {
        Budget food = budget("Food", 1000.0);
        food.setId(1L);
        food.setUser(user);
        when(budgetRepository.findByUser(user)).thenReturn(List.of(food));

        when(transactionRepository.findLatestThreeMonthsTransactions(1L))
                .thenReturn(List.of(txn("Food", -1200.0)));

        List<BudgetStatusDTO> result = service.getBudgetStatus();

        assertThat(result.get(0).getExceeded()).isTrue();
        assertThat(result.get(0).getSpent()).isEqualTo(1200.0);
    }

    @Test
    void getBudgetStatus_categoryMatchingIsCaseInsensitive() {
        Budget food = budget("Food", 5000.0);
        food.setId(1L);
        food.setUser(user);
        when(budgetRepository.findByUser(user)).thenReturn(List.of(food));

        when(transactionRepository.findLatestThreeMonthsTransactions(1L))
                .thenReturn(List.of(
                        txn("FOOD", -500.0),
                        txn("food", -300.0)
                ));

        List<BudgetStatusDTO> result = service.getBudgetStatus();

        assertThat(result.get(0).getSpent()).isEqualTo(800.0);
    }

    @Test
    void getBudgetStatus_otherCategoryTransactionsNotCounted() {
        Budget food = budget("Food", 5000.0);
        food.setId(1L);
        food.setUser(user);
        when(budgetRepository.findByUser(user)).thenReturn(List.of(food));

        when(transactionRepository.findLatestThreeMonthsTransactions(1L))
                .thenReturn(List.of(
                        txn("Food", -500.0),
                        txn("Travel", -1000.0)  // different category
                ));

        List<BudgetStatusDTO> result = service.getBudgetStatus();

        assertThat(result.get(0).getSpent()).isEqualTo(500.0);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Budget budget(String category, double limit) {
        Budget b = new Budget();
        b.setCategory(category);
        b.setLimitAmount(limit);
        return b;
    }

    private Transaction txn(String category, double amount) {
        Transaction t = new Transaction();
        t.setCategory(category);
        t.setAmount(amount);
        return t;
    }
}
