package com.fintwin.identity.security;

public final class PasswordValidator {

    private PasswordValidator() {}

    public static void validate(String password) {
        if (password == null || password.length() < 8)
            throw new IllegalArgumentException("Password must be at least 8 characters.");
        if (!password.chars().anyMatch(Character::isUpperCase))
            throw new IllegalArgumentException("Password must contain at least one uppercase letter.");
        if (!password.chars().anyMatch(Character::isDigit))
            throw new IllegalArgumentException("Password must contain at least one digit.");
        if (!password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{}|;':\",./<>?].*"))
            throw new IllegalArgumentException("Password must contain at least one special character (!@#$%^&* etc.).");
    }
}
