package com.fintwin.exception;

import java.util.HashMap;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(
        MethodArgumentNotValidException.class
    )
    public ResponseEntity<?> validationError(

            MethodArgumentNotValidException ex

    ) {

        Map<String,String> errors =
                new HashMap<>();

        ex.getBindingResult()
                .getFieldErrors()
                .forEach(error ->

                        errors.put(
                                error.getField(),
                                error.getDefaultMessage()
                        )
                );

        return ResponseEntity
                .badRequest()
                .body(errors);
    }
        @ExceptionHandler(IllegalArgumentException.class)
        public ResponseEntity<?> handleIllegalArgument(
                IllegalArgumentException ex
        ) {

        Map<String, String> error = new HashMap<>();

        error.put("error", ex.getMessage());

        return ResponseEntity
                .badRequest()
                .body(error);
        }
        @ExceptionHandler(RuntimeException.class)
        public ResponseEntity<?> handleRuntime(
                RuntimeException ex
        ) {

        Map<String, String> error = new HashMap<>();

        String msg = ex.getMessage();

        if ("Invalid credentials".equals(msg)) {
                error.put("error", msg);
                return ResponseEntity
                        .status(401)
                        .body(error);
        }

        if ("Account has been disabled".equals(msg)) {
                error.put("error", "ACCOUNT_DISABLED");
                return ResponseEntity
                        .status(403)
                        .body(error);
        }

        if ("An account with this email already exists".equals(msg)) {
                error.put("error", msg);
                return ResponseEntity
                        .status(409)
                        .body(error);
        }

        if ("Google token verification failed".equals(msg)
                || "Google credential must not be empty".equals(msg)) {
                error.put("error", msg);
                return ResponseEntity
                        .status(401)
                        .body(error);
        }

        // Never expose internal error details to clients
        error.put("error", "An unexpected error occurred");
        return ResponseEntity
                .internalServerError()
                .body(error);
        }
}