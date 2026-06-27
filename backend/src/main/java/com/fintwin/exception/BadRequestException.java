package com.fintwin.exception;

import org.springframework.http.HttpStatus;

/** 400 Bad Request — invalid client input. */
public class BadRequestException extends ApiException {
    public BadRequestException(String message) {
        super(HttpStatus.BAD_REQUEST, message);
    }
}
