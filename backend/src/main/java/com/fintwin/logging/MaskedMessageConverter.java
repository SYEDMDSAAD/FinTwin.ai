package com.fintwin.logging;

import ch.qos.logback.classic.pattern.MessageConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;
import com.fintwin.util.PiiRedactor;

/** {@code %maskedMsg}: the log message with identifiers and secrets masked (see {@link PiiRedactor}). */
public class MaskedMessageConverter extends MessageConverter {
    @Override
    public String convert(ILoggingEvent event) {
        return PiiRedactor.redact(super.convert(event));
    }
}
