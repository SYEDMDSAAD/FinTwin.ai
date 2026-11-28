package com.fintwin.service;

import com.fintwin.dto.NotificationDTO;
import com.fintwin.model.Budget;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.BudgetRepository;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** The bell's budget alerts compare a monthly budget with this month's spending. */
class NotificationBudgetAlertTest {

    private final TransactionRepository transactions = mock(TransactionRepository.class);
    private final BudgetRepository budgets = mock(BudgetRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final NotificationService service =
            new NotificationService(transactions, budgets, mock(FinancialGoalRepository.class), users);

    @AfterEach
    void signOut() { SecurityContextHolder.clearContext(); }

    private static Transaction tx(LocalDate date, double amount) {
        Transaction t = new Transaction();
        t.setDate(date);
        t.setAmount(amount);
        t.setCategory("Food");
        t.setMerchant("SWIGGY");
        return t;
    }

    private List<String> budgetAlerts(Budget food, List<Transaction> txns) {
        User user = new User();
        org.springframework.test.util.ReflectionTestUtils.setField(user, "id", 5L);
        user.setEmail("bell@example.com");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("bell@example.com", null, List.of()));
        when(users.findByEmail("bell@example.com")).thenReturn(Optional.of(user));
        when(transactions.findLatestThreeMonthsTransactions(5L)).thenReturn(txns);
        when(budgets.findByUser(any())).thenReturn(List.of(food));
        return service.generateNotifications().stream()
                .map(NotificationDTO::getMessage).filter(m -> m.startsWith("Food")).toList();
    }

    private static Budget food() {
        Budget b = new Budget();
        b.setCategory("Food");
        b.setLimitAmount(9_000.0);
        return b;
    }

    @Test
    void earlierMonthsDontCountAgainstThisMonthsBudget() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        var alerts = budgetAlerts(food(), List.of(
                tx(today.withDayOfMonth(1), -3_000),
                tx(today.minusMonths(1).withDayOfMonth(10), -10_000),
                tx(today.minusMonths(2).withDayOfMonth(10), -10_000)));
        assertThat(alerts).isEmpty();      // ₹3,000 of ₹9,000 this month
    }

    @Test
    void overThisMonthStillWarns() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        var alerts = budgetAlerts(food(), List.of(tx(today.withDayOfMonth(1), -10_700)));
        assertThat(alerts).hasSize(1);
        assertThat(alerts.get(0)).contains("exceeded").contains("1,700");
    }

    @Test
    void exactlyAtTheLimitIsntExceeded_andRentPaidInFullIsQuiet() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        var food = budgetAlerts(food(), List.of(tx(today.withDayOfMonth(1), -9_000)));
        assertThat(food).hasSize(1);
        assertThat(food.get(0)).doesNotContain("exceeded").contains("100%");

        Budget rent = new Budget();
        rent.setCategory("Rent");
        rent.setLimitAmount(17_500.0);
        Transaction paid = tx(today.withDayOfMonth(1), -17_500);
        paid.setCategory("Rent");
        when(budgets.findByUser(any())).thenReturn(List.of(rent));
        assertThat(service.generateNotifications().stream().map(NotificationDTO::getMessage)
                .filter(m -> m.startsWith("Rent"))).isEmpty();
    }

    @Test
    void aBudgetThatStartsNextMonthIsQuiet() {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        Budget food = food();
        food.setStartsOn(today.plusMonths(1).withDayOfMonth(1));
        assertThat(budgetAlerts(food, List.of(tx(today.withDayOfMonth(1), -10_700)))).isEmpty();
    }
}
