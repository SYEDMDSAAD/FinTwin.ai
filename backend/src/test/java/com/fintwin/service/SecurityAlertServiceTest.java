package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SecurityAlertServiceTest {

    @Mock private SecurityAdminService securityAdminService;
    @Mock private EmailService emailService;
    @Mock private UserRepository userRepository;

    @InjectMocks private SecurityAlertService service;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "cooldownMinutes", 360L);
    }

    private Map<String, Object> posture(String risk, int brute, int configIssues) {
        return Map.of(
                "riskLevel", risk,
                "bruteForceIPs", brute,
                "targetedAccounts", 0,
                "suspiciousSessions", 0,
                "dataAnomalies", 0,
                "configIssueCount", configIssues,
                "failedLoginsToday", 0);
    }

    private User admin() {
        User u = new User();
        u.setEmail("admin@fintwin.ai");
        u.setRole("ADMIN");
        return u;
    }

    @Test
    void doesNotAlertWhenRiskIsNotHigh() {
        when(securityAdminService.getPosture()).thenReturn(posture("LOW", 0, 0));

        service.checkAndAlert();

        verifyNoInteractions(emailService);
        verify(userRepository, never()).findEnabledByRoleIn(any());
    }

    @Test
    void alertsAdminsWhenRiskIsHigh() {
        when(securityAdminService.getPosture()).thenReturn(posture("HIGH", 4, 1));
        when(userRepository.findEnabledByRoleIn(any())).thenReturn(List.of(admin()));
        when(emailService.isConfigured()).thenReturn(true);

        service.checkAndAlert();

        verify(emailService).sendSecurityAlert(eq("admin@fintwin.ai"), anyString(), anyString());
    }

    @Test
    void deduplicatesIdenticalHighStateWithinCooldown() {
        when(securityAdminService.getPosture()).thenReturn(posture("HIGH", 4, 1));
        when(userRepository.findEnabledByRoleIn(any())).thenReturn(List.of(admin()));
        when(emailService.isConfigured()).thenReturn(true);

        service.checkAndAlert();   // sends
        service.checkAndAlert();   // same signature, within cooldown → suppressed

        verify(emailService, times(1)).sendSecurityAlert(anyString(), anyString(), anyString());
    }

    @Test
    void reAlertsWhenThreatStateChanges() {
        when(userRepository.findEnabledByRoleIn(any())).thenReturn(List.of(admin()));
        when(emailService.isConfigured()).thenReturn(true);
        when(securityAdminService.getPosture())
                .thenReturn(posture("HIGH", 4, 1))   // first
                .thenReturn(posture("HIGH", 9, 1));  // escalated → new signature

        service.checkAndAlert();
        service.checkAndAlert();

        verify(emailService, times(2)).sendSecurityAlert(anyString(), anyString(), anyString());
    }

    @Test
    void whenEmailNotConfiguredItStillMarksStateAndDoesNotThrow() {
        when(securityAdminService.getPosture()).thenReturn(posture("HIGH", 4, 1));
        when(userRepository.findEnabledByRoleIn(any())).thenReturn(List.of(admin()));
        when(emailService.isConfigured()).thenReturn(false);

        service.checkAndAlert();

        verify(emailService, never()).sendSecurityAlert(anyString(), anyString(), anyString());
    }

    @Test
    void disabledFlagShortCircuits() {
        ReflectionTestUtils.setField(service, "enabled", false);

        service.checkAndAlert();

        verifyNoInteractions(securityAdminService, emailService, userRepository);
    }
}
