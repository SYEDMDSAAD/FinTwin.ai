package com.fintwin.identity;

import com.fintwin.identity.model.User;
import com.fintwin.identity.repository.UserRepository;
import com.fintwin.identity.security.EmailHashUtil;
import com.fintwin.identity.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Base class for identity-service integration tests. Boots the full Spring
 * context against a real PostgreSQL container.
 *
 * Unlike the main backend, the identity service does not own the {@code users}
 * table (the backend's migrations create it; identity's Flyway script only ALTERs
 * it). In isolation there is no backend, so the test profile disables Flyway and
 * lets Hibernate build the schema from the identity entities.
 *
 * Singleton container pattern: started once per JVM, reused across test classes.
 * Tests skip gracefully when Docker is unavailable.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
public abstract class AbstractIdentityIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES;

    static {
        // docker-java (shaded in Testcontainers) reads "api.version" from system props;
        // Docker 26+ dropped API < 1.40, so pin it or the shaded copy defaults to 1.32.
        System.setProperty("api.version", "1.41");

        PostgreSQLContainer<?> c = null;
        try {
            c = new PostgreSQLContainer<>("postgres:17-alpine")
                    .withDatabaseName("identity_test")
                    .withUsername("test")
                    .withPassword("test");
            c.start();
        } catch (Exception ignored) {
            // Docker unavailable — tests skip via assumeTrue in @BeforeEach
        }
        POSTGRES = c;
    }

    @DynamicPropertySource
    static void overrideDataSource(DynamicPropertyRegistry registry) {
        if (POSTGRES != null && POSTGRES.isRunning()) {
            registry.add("spring.datasource.url",      POSTGRES::getJdbcUrl);
            registry.add("spring.datasource.username", POSTGRES::getUsername);
            registry.add("spring.datasource.password", POSTGRES::getPassword);
        }
    }

    @BeforeEach
    void skipIfDockerUnavailable() {
        assumeTrue(POSTGRES != null && POSTGRES.isRunning(), "Skipping: Docker / Postgres not available");
    }

    @LocalServerPort
    protected int port;

    @Autowired protected TestRestTemplate restTemplate;
    @Autowired protected UserRepository userRepository;
    @Autowired protected org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    @Autowired protected JwtUtil jwtUtil;

    protected String url(String path) {
        return "http://localhost:" + port + path;
    }

    // ── Seeding ───────────────────────────────────────────────────────────────

    /** Persists a fully verified, enabled user with the given role. */
    protected User seedUser(String email, String password, String role) {
        return userRepository.findByEmail(email).orElseGet(() -> {
            User u = new User();
            u.setFullName("Test User");
            u.setEmail(email);
            u.setEmailHash(EmailHashUtil.hash(email));
            u.setPassword(passwordEncoder.encode(password));
            u.setEmailVerified(true);
            u.setEnabled(true);
            u.setRole(role);
            u.setOnboardingCompleted(false);
            u.setConsentGivenAt(LocalDateTime.now());
            return userRepository.save(u);
        });
    }

    protected String accessTokenFor(String email) {
        return jwtUtil.generateAccessToken(email);
    }

    protected String tempTokenFor(String email) {
        return jwtUtil.generateTempToken(email);
    }

    // ── HTTP helpers ──────────────────────────────────────────────────────────

    protected HttpHeaders json() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.APPLICATION_JSON);
        return h;
    }

    protected HttpHeaders bearer(String token) {
        HttpHeaders h = json();
        h.setBearerAuth(token);
        return h;
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    protected ResponseEntity<Map> postJson(String path, Object body, HttpHeaders headers) {
        return restTemplate.exchange(url(path), HttpMethod.POST, new HttpEntity<>(body, headers), Map.class);
    }

    protected ResponseEntity<Map> postJson(String path, Object body) {
        return postJson(path, body, json());
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    protected ResponseEntity<Map> getJson(String path, HttpHeaders headers) {
        return restTemplate.exchange(url(path), HttpMethod.GET, new HttpEntity<>(headers), Map.class);
    }
}
