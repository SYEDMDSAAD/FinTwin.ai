package com.fintwin.logging;

import ch.qos.logback.classic.pattern.ThrowableProxyConverter;
import ch.qos.logback.classic.spi.IThrowableProxy;
import com.fintwin.util.PiiRedactor;

/**
 * {@code %maskedEx}: stack traces with identifiers and secrets masked. An
 * exception message often carries request data (a SQL error quoting a row,
 * a client error quoting a URL), so it gets the same treatment as the line.
 */
public class MaskedThrowableConverter extends ThrowableProxyConverter {
    @Override
    protected String throwableProxyToString(IThrowableProxy tp) {
        return PiiRedactor.redact(super.throwableProxyToString(tp));
    }
}
