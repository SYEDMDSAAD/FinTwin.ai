package com.fintwin.exception;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

@SuppressWarnings("unchecked")
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void apiExceptionWithACodeSendsItForTheClientToBranchOn() {
        ResponseEntity<?> res = handler.handleApiException(
                new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "This PDF is password-protected.", "password_required"));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
        assertThat((Map<String, String>) res.getBody())
                .containsEntry("error", "This PDF is password-protected.")
                .containsEntry("code", "password_required");
    }

    @Test
    void apiExceptionWithoutACodeKeepsTheOldShape() {
        ResponseEntity<?> res = handler.handleApiException(new NotFoundException("User not found"));

        assertThat((Map<String, String>) res.getBody()).containsOnlyKeys("error");
    }
}
