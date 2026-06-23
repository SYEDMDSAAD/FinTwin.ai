package com.fintwin.security;

public final class PasswordValidator {

    private PasswordValidator() {}

    /**
     * Enforces the application password policy:
     *   - Minimum 8 characters
     *   - At least one uppercase letter
     *   - At least one digit
     *   - At least one special character
     *
     * Throws IllegalArgumentException with a user-facing message on failure.
     */
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
