package com.fintwin.exception;

import org.springframework.http.HttpStatus;

/** 409 Conflict — request conflicts with current state (e.g. duplicate). */
public class ConflictException extends ApiException {
    public ConflictException(String message) {
        super(HttpStatus.CONFLICT, message);
    }
}
