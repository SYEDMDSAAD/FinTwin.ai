package com.fintwin;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.EmailHashUtil;
import com.fintwin.security.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Base class for all integration tests. Boots the full Spring context against
 * a real PostgreSQL container — Flyway migrations run on startup, so every
 * test sees a schema identical to production.
 *
 * Uses the singleton container pattern: the container is started once per JVM
 * in a static block (not via @Testcontainers/@Container), so it stays alive
 * across all test classes. Ryuk's shutdown hook stops it when the JVM exits.
 *
 * Tests skip gracefully when Docker is unavailable (assumeTrue in @BeforeEach).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES;

    static {
        // docker-java (shaded inside Testcontainers) reads "api.version" from System.getProperties().
        // Docker 26+ dropped support for API < 1.40; without this the shaded copy defaults to 1.32.
        System.setProperty("api.version", "1.41");

        PostgreSQLContainer<?> c = null;
        try {
            c = new PostgreSQLContainer<>("postgres:17-alpine")
                    .withDatabaseName("fintwin_test")
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
            registry.add("spring.flyway.url",          POSTGRES::getJdbcUrl);
            registry.add("spring.flyway.user",         POSTGRES::getUsername);
            registry.add("spring.flyway.password",     POSTGRES::getPassword);
        }
    }

    @BeforeEach
    void skipIfDockerUnavailable() {
        assumeTrue(POSTGRES != null && POSTGRES.isRunning(), "Skipping: Docker / Postgres not available");
    }

    @LocalServerPort
    protected int port;

    @Autowired
    protected TestRestTemplate restTemplate;

    @Autowired
    protected UserRepository userRepository;

    @Autowired
    protected PasswordEncoder passwordEncoder;

    @Autowired
    protected JwtUtil jwtUtil;

    protected String baseUrl() {
        return "http://localhost:" + port;
    }

    /**
     * Creates a fully verified USER in the DB and returns a valid JWT.
     * Bypasses email-verification flow — use this to seed test principals.
     */
    protected String seedUserAndGetToken(String email, String password) {
        if (userRepository.findByEmail(email).isEmpty()) {
            User user = new User();
            user.setFullName("Test User");
            user.setEmail(email);
            user.setEmailHash(EmailHashUtil.hash(email));
            user.setPassword(passwordEncoder.encode(password));
            user.setEmailVerified(true);
            user.setEnabled(true);
            user.setRole("USER");
            user.setConsentGivenAt(LocalDateTime.now());
            userRepository.save(user);
        }
        return jwtUtil.generateToken(email, "USER");
    }

    /**
     * Creates a fully verified ADMIN in the DB and returns a valid JWT.
     */
    protected String seedAdminAndGetToken(String email, String password) {
        if (userRepository.findByEmail(email).isEmpty()) {
            User user = new User();
            user.setFullName("Test Admin");
            user.setEmail(email);
            user.setEmailHash(EmailHashUtil.hash(email));
            user.setPassword(passwordEncoder.encode(password));
            user.setEmailVerified(true);
            user.setEnabled(true);
            user.setRole("ADMIN");
            user.setConsentGivenAt(LocalDateTime.now());
            userRepository.save(user);
        }
        return jwtUtil.generateToken(email, "ADMIN");
    }

    protected HttpHeaders authHeaders(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "Bearer " + token);
        return headers;
    }
}
