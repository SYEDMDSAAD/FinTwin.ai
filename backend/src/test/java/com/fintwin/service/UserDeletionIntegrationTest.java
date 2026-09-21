package com.fintwin.service;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.Investment;
import com.fintwin.model.Notification;
import com.fintwin.model.User;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.NotificationRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Deleting a user must take everything they own with it. Tables whose foreign
 * key to users doesn't cascade block the delete otherwise — which is how
 * admins found they couldn't delete any user holding an investment.
 */
class UserDeletionIntegrationTest extends AbstractIntegrationTest {

    @Autowired private ProfileService profileService;
    @Autowired private InvestmentRepository investments;
    @Autowired private NotificationRepository notifications;

    @Test
    void aUserWithInvestmentsAndNotificationsCanBeDeleted() {
        seedUserAndGetToken("has-investments@example.com", "Test@1234");
        User user = userRepository.findByEmail("has-investments@example.com").orElseThrow();

        Investment inv = new Investment();
        inv.setUser(user);
        inv.setName("Nifty 50 index fund");
        inv.setType("Mutual Fund");
        inv.setInvestedAmount(10_000.0);
        inv.setCurrentValue(11_200.0);
        inv.setPurchaseDate(LocalDate.of(2026, 1, 15));
        investments.save(inv);

        Notification n = new Notification();
        n.setUser(user);
        n.setType("info");
        n.setMessage("Upload your August statement");
        n.setCreatedAt(LocalDateTime.now());
        notifications.save(n);

        profileService.deleteUserById(user.getId());

        assertThat(userRepository.findById(user.getId())).isEmpty();
        assertThat(investments.findByUser(user)).isEmpty();
        assertThat(notifications.findByUser(user)).isEmpty();
    }
}
