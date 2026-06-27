package com.fintwin.exception;

import org.springframework.http.HttpStatus;

/** 423 Locked — the account is temporarily locked (e.g. brute-force lockout). */
public class LockedException extends ApiException {
    public LockedException(String message) {
        super(HttpStatus.LOCKED, message);
    }
}
