package com.fintwin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ExpenseRequest {

    @NotBlank(message = "Text cannot be empty")

    @Size(
        min = 2,
        max = 500,
        message = "Text must be between 2 and 500 characters"
    )
    private String text;

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }
}