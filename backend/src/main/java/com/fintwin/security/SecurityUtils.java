package com.fintwin.security;

import org.springframework.security.core.Authentication;

import org.springframework.security.core.context
        .SecurityContextHolder;

public class SecurityUtils {

    public static String getCurrentUserEmail() {

        Authentication auth =

                SecurityContextHolder
                        .getContext()
                        .getAuthentication();

        return auth.getName();
    }
}