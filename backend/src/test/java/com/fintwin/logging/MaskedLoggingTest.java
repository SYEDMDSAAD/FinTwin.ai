package com.fintwin.logging;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.LoggingEvent;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MaskedLoggingTest {

    private final LoggerContext ctx = new LoggerContext();

    private LoggingEvent event(String msg, Object[] args, Throwable t) {
        return new LoggingEvent("x", ctx.getLogger("x"), Level.INFO, msg, t, args);
    }

    @Test
    void theMessageIsMaskedAfterItsArgumentsAreFilledIn() {
        String out = new MaskedMessageConverter().convert(
                event("Verification OTP sent to {} for {}", new Object[]{"someone@gmail.com", "9876543210"}, null));
        assertThat(out).isEqualTo("Verification OTP sent to <EMAIL> for <PHONE>");
    }

    @Test
    void stackTracesAreMaskedToo() {
        MaskedThrowableConverter converter = new MaskedThrowableConverter();
        converter.start();
        LoggingEvent e = event("failed", null, new IllegalStateException("bad row for rahul@okaxis"));
        String out = converter.convert(e);
        assertThat(out).contains("<UPI_ID>").doesNotContain("rahul@okaxis");
    }

    @Test
    void jsonValuesAreMaskedAndCleanOnesLeftAlone() {
        PiiValueMasker masker = new PiiValueMasker();
        assertThat(masker.mask(null, "sent to someone@gmail.com")).isEqualTo("sent to <EMAIL>");
        assertThat(masker.mask(null, "imported 42 rows")).isNull();
        assertThat(masker.mask(null, 42)).isNull();
    }
}
