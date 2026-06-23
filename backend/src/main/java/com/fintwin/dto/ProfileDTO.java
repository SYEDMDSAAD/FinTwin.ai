package com.fintwin.dto;

public class ProfileDTO {

    private String fullName;

    private String email;

    private String createdAt;

    private Long totalTransactions;

    private Long totalGoals;

    private Integer financialScore;

    public ProfileDTO(
            String fullName,
            String email,
            String createdAt,
            Long totalTransactions,
            Long totalGoals,
            Integer financialScore
    ) {

        this.fullName = fullName;
        this.email = email;
        this.createdAt = createdAt;
        this.totalTransactions = totalTransactions;
        this.totalGoals = totalGoals;
        this.financialScore = financialScore;
    }

    public String getFullName() {
        return fullName;
    }

    public String getEmail() {
        return email;
    }

    public String getCreatedAt() {
        return createdAt;
    }

    public Long getTotalTransactions() {
        return totalTransactions;
    }

    public Long getTotalGoals() {
        return totalGoals;
    }

    public Integer getFinancialScore() {
        return financialScore;
    }
}