package com.fintwin.demo;

import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.context.request.RequestContextHolder;

import java.util.Optional;

/**
 * Which demo visitor a request comes from. Everyone in the demo shares one
 * account, so services that keep per-person state (the copilot's chat
 * history, its question limit) key it by this instead of the user.
 */
public final class DemoSession {

    /** JWT claim carrying the session id on a demo token. */
    public static final String CLAIM = "demo_sid";
    /** Request attribute JwtFilter sets for an authenticated demo request. */
    public static final String REQUEST_ATTR = "fintwin.demoSession";
    /** The demo account's role. */
    public static final String ROLE = "DEMO";

    private DemoSession() {}

    /** The current request's demo session, if it is one. */
    public static Optional<String> current() {
        RequestAttributes attrs = RequestContextHolder.getRequestAttributes();
        if (attrs == null) return Optional.empty();
        Object sid = attrs.getAttribute(REQUEST_ATTR, RequestAttributes.SCOPE_REQUEST);
        return sid instanceof String s && !s.isBlank() ? Optional.of(s) : Optional.empty();
    }
}
