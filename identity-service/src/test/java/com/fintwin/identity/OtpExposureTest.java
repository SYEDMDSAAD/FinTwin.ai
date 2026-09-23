package com.fintwin.identity;

import com.fintwin.identity.config.SecurityStartupValidator;
import com.fintwin.identity.service.EmailService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * Sign-up used to return the verification OTP, and "forgot password" the reset
 * link, whenever no mail provider was configured — regardless of environment.
 * On a production deployment with a missing MAIL_* that hands account takeover
 * to anyone who types an address, so it is now refused twice over.
 */
class OtpExposureTest {

    private EmailService emailService(boolean mailConfigured, boolean production) {
        EmailService svc = new EmailService(null);
        ReflectionTestUtils.setField(svc, "mailEnabled", mailConfigured);
        ReflectionTestUtils.setField(svc, "mailUsername", mailConfigured ? "beta@fintwin.ai" : "");
        ReflectionTestUtils.setField(svc, "requireSecureConfig", production);
        return svc;
    }

    @Test
    void localDevWithoutMailStillGetsTheOtpBack() {
        assertThat(emailService(false, false).canRevealSecrets()).isTrue();
    }

    @Test
    void productionWithoutMailNeverRevealsTheOtp() {
        assertThat(emailService(false, true).canRevealSecrets()).isFalse();
    }

    @Test
    void configuredMailSendsTheOtpInsteadOfReturningIt() {
        assertThat(emailService(true, false).canRevealSecrets()).isFalse();
        assertThat(emailService(true, true).canRevealSecrets()).isFalse();
    }

    private SecurityStartupValidator validator(boolean mailConfigured, boolean production) {
        SecurityStartupValidator v = new SecurityStartupValidator(new MockEnvironment());
        ReflectionTestUtils.setField(v, "jwtSecret", "a-real-secret-that-is-not-the-dev-default-value");
        ReflectionTestUtils.setField(v, "encryptionKey", "a-real-encryption-key");
        ReflectionTestUtils.setField(v, "internalKey", "a-real-internal-key");
        ReflectionTestUtils.setField(v, "mailEnabled", mailConfigured);
        ReflectionTestUtils.setField(v, "mailUsername", mailConfigured ? "beta@fintwin.ai" : "");
        ReflectionTestUtils.setField(v, "requireSecureConfig", production);
        return v;
    }

    @Test
    void productionStartupIsRefusedWhenMailIsMissing() {
        assertThatThrownBy(() -> validator(false, true).validate())
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MAIL_ENABLED");
    }

    @Test
    void localStartupOnlyWarns() {
        assertThatCode(() -> validator(false, false).validate()).doesNotThrowAnyException();
        assertThatCode(() -> validator(true, true).validate()).doesNotThrowAnyException();
    }
}
