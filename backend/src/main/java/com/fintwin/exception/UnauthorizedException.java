package com.fintwin.exception;

import org.springframework.http.HttpStatus;

/** 401 Unauthorized — authentication missing, invalid, or failed. */
public class UnauthorizedException extends ApiException {
    public UnauthorizedException(String message) {
        super(HttpStatus.UNAUTHORIZED, message);
    }
}
