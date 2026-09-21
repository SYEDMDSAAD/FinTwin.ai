package com.fintwin.exception;

import org.springframework.http.HttpStatus;

/**
 * Base class for application errors that carry their own HTTP status.
 *
 * Replaces the previous pattern of throwing bare {@code RuntimeException}s whose
 * status was inferred by string-matching the message in {@code GlobalExceptionHandler}.
 * Throwing one of these (or a subclass) makes the resulting status explicit and
 * decoupled from the human-readable message.
 */
public class ApiException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public ApiException(HttpStatus status, String message) {
        this(status, message, null);
    }

    /**
     * @param code machine-readable reason the client can branch on (for example
     *             "password_required"), sent alongside the message; null for none
     */
    public ApiException(HttpStatus status, String message, String code) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
