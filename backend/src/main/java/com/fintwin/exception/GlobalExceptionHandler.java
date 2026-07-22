package com.fintwin.exception;

import java.util.HashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log =
            LoggerFactory.getLogger(GlobalExceptionHandler.class);

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

        // Optimistic-locking conflict (@Version): two writers raced on the same row.
        // The client's copy is stale — tell them to refetch and retry.
        @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
        public ResponseEntity<?> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "This record was modified by another request. Please refresh and try again.");
                return ResponseEntity.status(409).body(error);
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
        // Method-security failures (@PreAuthorize) surface here, not at the filter
        // chain — without this handler they fall into the RuntimeException fallback
        // and masquerade as 500s.
        @ExceptionHandler(AccessDeniedException.class)
        public ResponseEntity<?> handleAccessDenied(AccessDeniedException ex) {
                Map<String, String> error = new HashMap<>();
                error.put("error", "Forbidden");
                return ResponseEntity
                        .status(HttpStatus.FORBIDDEN)
                        .body(error);
        }

        // Fallback for any uncaught RuntimeException. Client-facing errors should be
        // thrown as ApiException subclasses (handled above) which carry their own
        // status; anything reaching here is treated as an unexpected server error.
        // Internal details are never exposed to the client.
        @ExceptionHandler(RuntimeException.class)
        public ResponseEntity<?> handleRuntime(RuntimeException ex) {
                log.error("Unhandled server error", ex);
                Map<String, String> error = new HashMap<>();
                error.put("error", "An unexpected error occurred");
                return ResponseEntity
                        .internalServerError()
                        .body(error);
        }
}