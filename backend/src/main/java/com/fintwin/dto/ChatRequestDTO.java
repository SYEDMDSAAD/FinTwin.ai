package com.fintwin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.Map;

public class ChatRequestDTO {

    @NotBlank(message = "Message cannot be empty")

    @Size(
        min = 2,
        max = 1000,
        message = "Message must be between 2 and 1000 characters"
    )
    private String message;

    private String mode;

    private Map<String, Object> financialData;

    public ChatRequestDTO() {
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getMode(){
        return mode;
    }

    public void setMode(String mode){
        this.mode = mode;
    }

    public Map<String, Object> getFinancialData() {
        return financialData;
    }

    public void setFinancialData(
            Map<String, Object> financialData
    ) {
        this.financialData = financialData;
    }
}