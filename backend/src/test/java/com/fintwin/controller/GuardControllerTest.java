package com.fintwin.controller;

import com.fintwin.ai.AiQuotaExceededException;
import com.fintwin.demo.DemoGuardLimits;
import com.fintwin.demo.DemoSession;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.AiToolToken;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Set;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * The proxy's own rules, without Spring or Docker: who may call, which actions
 * exist, and that the user id and tool token always come from the server.
 * Role checks (DEMO, logged out) are in GuardAccessIntegrationTest.
 */
class GuardControllerTest {

    private static final String EMAIL = "guard-user@example.com";
    private static final long USER_ID = 42L;
    private static final String URL = "https://guard.example.run.app";

    private RestTemplate rest;
    private UserRepository users;
    private AiToolToken tokens;

    @BeforeEach
    void setUp() {
        rest = mock(RestTemplate.class);
        users = mock(UserRepository.class);
        tokens = new AiToolToken("unit-test-jwt-secret-that-is-long-enough-for-hmac");
        User user = mock(User.class);   // User has no id setter; the id comes from the database
        when(user.getId()).thenReturn(USER_ID);
        when(users.findByEmail(EMAIL)).thenReturn(Optional.of(user));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                EMAIL, null, List.of(new SimpleGrantedAuthority("USE_SPEND_GUARD"))));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        RequestContextHolder.resetRequestAttributes();
    }

    /** As JwtFilter marks a request made with a demo token. */
    private static void demoVisit(String visit) {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.setAttribute(DemoSession.REQUEST_ATTR, visit);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(req));
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                "demo@fintwin.app", null, List.of(new SimpleGrantedAuthority("ROLE_DEMO"))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void demoVisit_getsItsOwnRecords_noToken_andNothingReachesFinTwin() {
        demoVisit("visit-abc");
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of(
                "choice", "paid", "record", Map.of("eventId", "e1"), "goalPlan", Map.of("goals", List.of()))));

        ResponseEntity<Map<String, Object>> resp = controller(URL, "").call("outcome",
                Map.of("eventId", "e1", "choice", "paid", "userId", 13, "toolToken", "forged", "demo", false));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("choice", "paid").doesNotContainKeys("record", "goalPlan");
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(rest).postForEntity(eq(URL + "/guard/outcome"), sent.capture(), eq(Map.class));
        assertThat(sent.getValue()).containsEntry("userId", GuardController.demoGuardId("visit-abc"))
                .containsEntry("demo", true).doesNotContainKey("toolToken");
        assertThat(GuardController.demoGuardId("visit-abc")).isGreaterThanOrEqualTo(GuardController.DEMO_ID_BASE)
                .isEqualTo(GuardController.demoGuardId("visit-abc"))
                .isNotEqualTo(GuardController.demoGuardId("visit-xyz"));
        verifyNoInteractions(users);                          // the shared account is never looked up
        assertThat(controller(URL, "").enabled()).containsEntry("enabled", true).containsEntry("demo", true);
        assertThat(controller(URL, "").unrecord(Map.of("eventId", "e1")).getBody()).containsEntry("removed", false);
        assertThat(controller(URL, "").call("hello", Map.of()).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void demoVisit_modelCallsAreCappedPerVisitAndPerDay() {
        demoVisit("visit-abc");
        GuardController c = controller(URL, "");
        c.demoLimits = new DemoGuardLimits(2, 3);
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of()));

        assertThat(c.call("check", Map.of()).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(c.call("wallet", Map.of()).getStatusCode()).isEqualTo(HttpStatus.OK);    // free
        assertThat(c.call("topup", Map.of()).getStatusCode()).isEqualTo(HttpStatus.OK);
        ResponseEntity<Map<String, Object>> third = c.call("check", Map.of());
        assertThat(third.getStatusCode().value()).isEqualTo(429);
        assertThat((String) third.getBody().get("error")).contains("2 Spend Guard checks");

        demoVisit("visit-other");                             // a new visit has its own two...
        assertThat(c.call("check", Map.of()).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(c.call("check", Map.of()).getStatusCode().value()).isEqualTo(429);   // ...but the day's 3 are used
    }

    @Test
    @SuppressWarnings("unchecked")
    void aRealUser_canNeverClaimToBeADemoVisit() {
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of()));
        controller(URL, "42").call("check", Map.of("demo", true));
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(rest).postForEntity(anyString(), sent.capture(), eq(Map.class));
        assertThat(sent.getValue()).containsEntry("demo", false).containsEntry("userId", USER_ID);
    }

    private GuardController controller(String url, String allowed) {
        return new GuardController(rest, tokens, users, url, allowed);
    }

    @Test
    void unknownAction_is404_andNothingIsCalled() {
        ResponseEntity<Map<String, Object>> resp = controller(URL, "42").call("../admin", Map.of());
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        verifyNoInteractions(rest);
    }

    @Test
    void notConfigured_is503() {
        ResponseEntity<Map<String, Object>> resp = controller("", "42").call("check", Map.of());
        assertThat(resp.getStatusCode().value()).isEqualTo(503);
        assertThat(resp.getBody()).containsEntry("error", GuardController.NOT_SET_UP);
        verifyNoInteractions(rest);
    }

    @Test
    void userNotOnTheAllowlist_is403() {
        ResponseEntity<Map<String, Object>> resp = controller(URL, "7, 8").call("check", Map.of());
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(resp.getBody()).containsEntry("error", GuardController.NOT_OPEN);
        verifyNoInteractions(rest);
    }

    @Test
    @SuppressWarnings("unchecked")
    void forwardsWithTheServersUserIdAndAFreshToken_overwritingTheBrowsers() {
        when(rest.postForEntity(anyString(), any(), eq(Map.class)))
                .thenReturn(ResponseEntity.ok(Map.of("decision", "go")));

        ResponseEntity<Map<String, Object>> resp = controller(URL + "/", "42").call("check",
                Map.of("qr", "upi://pay?pa=shop@okaxis", "amount", 120,
                        "userId", 1, "toolToken", "forged"));

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resp.getBody()).containsEntry("decision", "go");
        ArgumentCaptor<Map<String, Object>> sent = ArgumentCaptor.forClass(Map.class);
        verify(rest).postForEntity(eq(URL + "/guard/check"), sent.capture(), eq(Map.class));
        assertThat(sent.getValue()).containsEntry("userId", USER_ID).containsEntry("amount", 120);
        String token = (String) sent.getValue().get("toolToken");
        assertThat(token).isNotEqualTo("forged");
        assertThat(tokens.allows(token, USER_ID)).isTrue();
        assertThat(tokens.allows(token, 1L)).isFalse();
    }

    @Test
    void aConfirmedPayment_isRecordedInFinTwin_andTheProposalNeverReachesTheBrowser() {
        com.fintwin.service.SpendGuardLinks links = mock(com.fintwin.service.SpendGuardLinks.class);
        when(links.recordPayment(eq(USER_ID), any())).thenReturn(99L);
        GuardController c = new GuardController(rest, tokens, users, URL, "42", links);
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of(
                "choice", "paid", "record", Map.of("eventId", "e1", "amount", "450.00"))));

        ResponseEntity<Map<String, Object>> resp = c.call("confirm", Map.of("eventId", "e1", "paid", true));

        assertThat(resp.getBody()).containsEntry("recordedTransactionId", 99L).doesNotContainKey("record");
        verify(links).recordPayment(eq(USER_ID), any());
    }

    @Test
    void undoPaid_askedOnlyWhileTheTransactionIsSpendGuards_andTheBrowserCantSayOtherwise() {
        com.fintwin.service.SpendGuardLinks links = mock(com.fintwin.service.SpendGuardLinks.class);
        when(links.stillProvisional(USER_ID, "e1")).thenReturn(false);
        when(links.notInStatement(USER_ID)).thenReturn(Set.of());
        when(links.unrecordPayment(USER_ID, "e1")).thenReturn(true);
        GuardController c = new GuardController(rest, tokens, users, URL, "42", links);
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of(
                "choice", "not_paid", "unrecord", true, "wallet", Map.of("recent", List.of()))));

        ResponseEntity<Map<String, Object>> resp = c.call("undo-paid", Map.of("eventId", "e1", "stillProvisional", true));

        ArgumentCaptor<Object> sent = ArgumentCaptor.forClass(Object.class);
        verify(rest).postForEntity(eq(URL + "/guard/undo-paid"), sent.capture(), eq(Map.class));
        assertThat((Map<String, Object>) sent.getValue()).containsEntry("stillProvisional", false);   // the backend's answer
        assertThat(resp.getBody()).containsEntry("removedTransaction", true).doesNotContainKey("unrecord");
    }

    @Test
    void theWallet_marksPaymentsTheStatementDidntShow_andKeepClearsTheFlag() {
        com.fintwin.service.SpendGuardLinks links = mock(com.fintwin.service.SpendGuardLinks.class);
        when(links.notInStatement(USER_ID)).thenReturn(Set.of("e2"));
        GuardController c = new GuardController(rest, tokens, users, URL, "42", links);
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenReturn(ResponseEntity.ok(Map.of(
                "recent", List.of(Map.of("id", "e1"), Map.of("id", "e2")))));

        List<Map<String, Object>> recent = (List<Map<String, Object>>) c.call("wallet", Map.of()).getBody().get("recent");
        assertThat(recent.get(0)).doesNotContainKey("notInStatement");
        assertThat(recent.get(1)).containsEntry("notInStatement", true);

        c.call("keep-paid", Map.of("eventId", "e2"));
        verify(links).keepPayment(USER_ID, "e2");
    }

    @Test
    void guardServiceRejection_passesItsMessageOn() {
        String body = "{\"detail\":\"That isn't a UPI payment QR code.\"}";
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenThrow(
                HttpClientErrorException.create(HttpStatus.BAD_REQUEST, "Bad Request", HttpHeaders.EMPTY,
                        body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8));

        ResponseEntity<Map<String, Object>> resp = controller(URL, "42").call("check", Map.of());

        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(resp.getBody()).containsEntry("error", "That isn't a UPI payment QR code.");
    }

    @Test
    void nonJsonRejection_getsAPlainMessage() {
        when(rest.postForEntity(anyString(), any(), eq(Map.class))).thenThrow(
                HttpClientErrorException.create(HttpStatus.NOT_FOUND, "Not Found", HttpHeaders.EMPTY,
                        "<html>stack trace</html>".getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8));

        ResponseEntity<Map<String, Object>> resp = controller(URL, "42").call("outcome", Map.of());

        assertThat(resp.getBody()).containsEntry("error", "Spend Guard couldn't do that.");
    }

    @Test
    void dailyAiLimit_is429() {
        when(rest.postForEntity(anyString(), any(), eq(Map.class)))
                .thenThrow(new AiQuotaExceededException(100, 100));

        ResponseEntity<Map<String, Object>> resp = controller(URL, "42").call("topup", Map.of());

        assertThat(resp.getStatusCode().value()).isEqualTo(429);
        assertThat(resp.getBody()).containsEntry("error", GuardController.QUOTA);
    }

    @Test
    void slowGuardService_is504_andDownIs503() {
        when(rest.postForEntity(anyString(), any(), eq(Map.class)))
                .thenThrow(new ResourceAccessException("timeout", new SocketTimeoutException("Read timed out")))
                .thenThrow(new ResourceAccessException("refused"));

        assertThat(controller(URL, "42").call("check", Map.of()).getStatusCode().value()).isEqualTo(504);
        assertThat(controller(URL, "42").call("check", Map.of()).getStatusCode().value()).isEqualTo(503);
    }

    @Test
    void enabled_onlyWhenConfiguredAndAllowlisted() {
        assertThat(controller(URL, "42").enabled()).containsEntry("enabled", true);
        assertThat(controller(URL, "43").enabled()).containsEntry("enabled", false);
        assertThat(controller("", "42").enabled()).containsEntry("enabled", false);
    }

    @Test
    void allowlist_ignoresJunk() {
        assertThat(GuardController.parseIds(" 1, x, 2,,3; ,-4")).containsExactlyInAnyOrder(1L, 2L);
        assertThat(GuardController.parseIds(null)).isEmpty();
    }
}
