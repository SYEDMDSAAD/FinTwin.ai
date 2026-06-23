package com.fintwin.config;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.EmailHashUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

// Only active in the "dev" profile — never runs in production.
// To bootstrap a prod admin use POST /admin/promote with the ADMIN_KEY.
@Profile("dev")
@Component
public class DataSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

    private static final String ADMIN_EMAIL    = "admin@test.com";
    private static final String ADMIN_PASSWORD = "12345678";
    private static final String ADMIN_NAME     = "Admin";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public DataSeeder(UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (userRepository.findByEmail(ADMIN_EMAIL).isPresent()) {
            return;
        }

        User admin = new User();
        admin.setFullName(ADMIN_NAME);
        admin.setEmail(ADMIN_EMAIL);
        admin.setEmailHash(EmailHashUtil.hash(ADMIN_EMAIL));
        admin.setPassword(passwordEncoder.encode(ADMIN_PASSWORD));
        admin.setRole("ADMIN");
        admin.setEnabled(true);
        admin.setOnboardingCompleted(true);

        userRepository.save(admin);
        log.info("Seeded default admin account: {}", ADMIN_EMAIL);
    }
}
