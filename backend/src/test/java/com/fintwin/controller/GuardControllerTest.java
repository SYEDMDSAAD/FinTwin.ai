package com.fintwin.controller;

import com.fintwin.ai.AiQuotaExceededException;
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

import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.List;
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
