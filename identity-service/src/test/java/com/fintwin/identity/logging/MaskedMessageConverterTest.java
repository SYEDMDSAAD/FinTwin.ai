package com.fintwin.identity.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MaskedMessageConverterTest {

    @Test
    void whoAnOtpWentToIsNotLogged() {
        LoggerContext ctx = new LoggerContext();
        LoggingEvent e = new LoggingEvent("x", ctx.getLogger("x"), Level.INFO,
                "Verification OTP sent to {}", null, new Object[]{"someone@gmail.com"});
        assertThat(new MaskedMessageConverter().convert(e)).isEqualTo("Verification OTP sent to <EMAIL>");
    }

    @Test
    void secretsAndNumbersAreMaskedButOrdinaryTextIsNot() {
        assertThat(MaskedMessageConverter.mask("otp: 482913 for 9876543210")).isEqualTo("otp: <REDACTED> for <PHONE>");
        assertThat(MaskedMessageConverter.mask("Purged 12 expired tokens for user 13")).isEqualTo("Purged 12 expired tokens for user 13");
    }
}
