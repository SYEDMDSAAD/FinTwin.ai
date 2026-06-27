package com.fintwin.exception;

import java.util.HashMap;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    // Typed application exceptions carry their own status — handled before the
    // generic RuntimeException fallback below. New code should throw these.
    @ExceptionHandler(ApiException.class)
    public ResponseEntity<?> handleApiException(ApiException ex) {
        Map<String, String> error = new HashMap<>();
        error.put("error", ex.getMessage());
        return ResponseEntity.status(ex.getStatus()).body(error);
    }

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
        @ExceptionHandler(HttpMessageNotReadableException.class)
        public ResponseEntity<?> handleUnreadableBody(HttpMessageNotReadableException ex) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "Malformed or missing request body");
                return ResponseEntity.badRequest().body(error);
        }

        @ExceptionHandler(DataIntegrityViolationException.class)
        public ResponseEntity<?> handleDataIntegrity(DataIntegrityViolationException ex) {
                Map<String, String> error = new HashMap<>();
                String msg = ex.getMessage() != null ? ex.getMessage().toLowerCase() : "";
                if (msg.contains("email")) {
                        error.put("error", "An account with this email already exists");
                        return ResponseEntity.status(409).body(error);
                }
                error.put("error", "A database constraint was violated");
                return ResponseEntity.status(409).body(error);
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

        if ("No account found with that email address".equals(msg)) {
                error.put("error", msg);
                return ResponseEntity
                        .status(404)
                        .body(error);
        }

        if (msg != null && msg.startsWith("Invalid or expired reset link")) {
                error.put("error", msg);
                return ResponseEntity
                        .status(400)
                        .body(error);
        }

        if ("OTP has expired — please request a new one".equals(msg)
                || "Incorrect OTP".equals(msg)
                || "Reset link has expired — please request a new one".equals(msg)) {
                error.put("error", msg);
                return ResponseEntity
                        .status(400)
                        .body(error);
        }

        if ("Google token verification failed".equals(msg)
                || "Google credential must not be empty".equals(msg)) {
                error.put("error", msg);
                return ResponseEntity
                        .status(401)
                        .body(error);
        }

        if (msg != null && (msg.startsWith("You already have a connected bank account")
                || msg.startsWith("A bank connection is already in progress"))) {
                error.put("error", msg);
                return ResponseEntity
                        .status(409)
                        .body(error);
        }

        // Never expose internal error details to clients
        error.put("error", "An unexpected error occurred");
        return ResponseEntity
                .internalServerError()
                .body(error);
        }
}