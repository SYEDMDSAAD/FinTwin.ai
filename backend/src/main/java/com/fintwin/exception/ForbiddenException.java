package com.fintwin.exception;

import org.springframework.http.HttpStatus;

/** 403 Forbidden — authenticated but not allowed. */
public class ForbiddenException extends ApiException {
    public ForbiddenException(String message) {
        super(HttpStatus.FORBIDDEN, message);
    }
}
