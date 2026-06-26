package com.fintwin.config;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.EmailHashUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Seeds the default admin account on first startup if it doesn't exist yet.
 * Override credentials via env vars: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME.
 * Set SEED_ADMIN_ENABLED=false to disable seeding entirely in production.
 */
@Component
public class DataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    @Value("${seed.admin.enabled:true}")
    private boolean enabled;

    @Value("${seed.admin.email:admin@test.com}")
    private String adminEmail;

    @Value("${seed.admin.password:N@1710862}")
    private String adminPassword;

    @Value("${seed.admin.name:Admin}")
    private String adminName;

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!enabled) return;

        if (userRepository.findByEmail(adminEmail).isPresent()) {
            log.debug("Admin account already exists — skipping seed");
            return;
        }

        User admin = new User();
        admin.setFullName(adminName);
        admin.setEmail(adminEmail);
        admin.setEmailHash(EmailHashUtil.hash(adminEmail));
        admin.setPassword(passwordEncoder.encode(adminPassword));
        admin.setRole("ADMIN");
        admin.setEnabled(true);
        admin.setEmailVerified(true);
        admin.setOnboardingCompleted(true);

        userRepository.save(admin);
        log.info("Seeded admin account: {}", adminEmail);
    }
}
