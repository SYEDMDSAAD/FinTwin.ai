package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.EmailHashUtil;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class EmailMigrationService {

    private static final Logger log = LoggerFactory.getLogger(EmailMigrationService.class);

    @Autowired
    private UserRepository userRepository;

    @PostConstruct
    @Transactional
    public void backfillEmailHashes() {
        List<User> users = userRepository.findAll();
        int count = 0;
        for (User user : users) {
            if (user.getEmailHash() == null && user.getEmail() != null) {
                // getEmail() returns plaintext for legacy unencrypted rows
                // (EncryptionConverter falls back to raw value on decrypt failure)
                user.setEmailHash(EmailHashUtil.hash(user.getEmail()));
                userRepository.save(user);
                count++;
            }
        }
        if (count > 0) {
            log.info("Backfilled emailHash for {} user(s)", count);
        }
    }
}
