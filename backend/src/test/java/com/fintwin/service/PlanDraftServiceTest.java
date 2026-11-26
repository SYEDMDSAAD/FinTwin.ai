package com.fintwin.service;

import com.fintwin.model.Budget;
import com.fintwin.model.User;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.*;

class PlanDraftServiceTest {

    private final UserRepository users = mock(UserRepository.class);
    private final BudgetRepository budgets = mock(BudgetRepository.class);
    private final ProfileService profiles = mock(ProfileService.class);
    private final PlanDraftService service = new PlanDraftService(users, mock(TransactionRepository.class), budgets, profiles);
    private final User user = new User();

    @BeforeEach
    void signIn() {
        user.setEmail("plan@example.com");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("plan@example.com", null, List.of()));
        when(users.findByEmail("plan@example.com")).thenReturn(Optional.of(user));
    }

    @AfterEach
    void signOut() {
        SecurityContextHolder.clearContext();
    }

    private Budget budget(String category, double limit) {
        Budget b = new Budget();
        b.setCategory(category);
        b.setLimitAmount(limit);
        b.setUser(user);
        return b;
    }

    @Test
    void createsNewBudgetsAndUpdatesExistingOnes() {
        Budget food = budget("Food", 2_000);
        Budget rent = budget("Rent", 15_000);
        when(budgets.findByUser(user)).thenReturn(List.of(food, rent));

        var r = service.apply(List.of(
                new PlanDraftService.ApprovedLine("food", 2_700.0),
                new PlanDraftService.ApprovedLine("Rent", 15_000.0),
                new PlanDraftService.ApprovedLine("shopping", 1_800.0)));

        assertThat(r).isEqualTo(new PlanDraftService.Applied(1, 1, 1));
        assertThat(food.getLimitAmount()).isEqualTo(2_700.0);
        verify(budgets).saveAll(argThat((List<Budget> saved) -> saved.size() == 2
                && saved.stream().anyMatch(b -> b.getCategory().equals("Shopping") && b.getUser() == user)));
        verify(profiles).saveScoreSnapshot(user);
    }

    @Test
    void refusesBadLines() {
        when(budgets.findByUser(user)).thenReturn(List.of());
        assertThatThrownBy(() -> service.apply(List.of(new PlanDraftService.ApprovedLine("Food", 0.0))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.apply(List.of(
                new PlanDraftService.ApprovedLine("Food", 100.0), new PlanDraftService.ApprovedLine("food", 200.0))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.apply(List.of())).isInstanceOf(IllegalArgumentException.class);
        verify(budgets, never()).saveAll(anyList());
    }
}
