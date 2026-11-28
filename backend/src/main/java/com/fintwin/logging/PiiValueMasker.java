package com.fintwin.logging;

import com.fintwin.util.PiiRedactor;
import net.logstash.logback.mask.ValueMasker;
import tools.jackson.core.TokenStreamContext;

/** JSON logs (prod profile): every string value — message, stack trace, MDC — masked like the console. */
public class PiiValueMasker implements ValueMasker {
    @Override
    public Object mask(TokenStreamContext context, Object value) {
        if (!(value instanceof String s)) return null;
        String masked = PiiRedactor.redact(s);
        return masked.equals(s) ? null : masked;     // null = leave the value as it is
    }
}
