package com.fintwin.security;

import com.fintwin.exception.UnauthorizedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public class SecurityUtils {

    public static String getCurrentUserEmail() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()
                || auth instanceof AnonymousAuthenticationToken) {
            // Typed so it maps to 401, not the 500 a bare RuntimeException produced.
            throw new UnauthorizedException("User not authenticated");
        }
        return auth.getName();
    }
}
