package com.fintwin.demo;

/** A demo visitor has asked the copilot as much as the demo allows. */
public class DemoLimitException extends RuntimeException {
    public DemoLimitException(String message) {
        super(message);
    }
}
