package com.fintwin.dto;

public class BudgetStatusDTO {

    private String category;

    private Double limit;

    private Double spent;

    private Double remaining;

    private Boolean exceeded;

    private Long id;
    // What Spend Guard's approved rebalances added (or took away, negative) this month; limit includes it
    private Double adjustment = 0.0;

    // =========================
    // Constructor
    // =========================

    public BudgetStatusDTO(
        Long id,
        String category,
        Double limit,
        Double spent,
        Double remaining,
        Boolean exceeded
    ) {

        this.id = id;

        this.category = category;

        this.limit = limit;

        this.spent = spent;

        this.remaining = remaining;

        this.exceeded = exceeded;

    }

    // =========================
    // Getters
    // =========================

    public String getCategory() {
        return category;
    }

    public Double getLimit() {
        return limit;
    }

    public Double getSpent() {
        return spent;
    }

    public Double getRemaining() {
        return remaining;
    }

    public Boolean getExceeded() {
        return exceeded;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Double getAdjustment() {
        return adjustment;
    }

    public void setAdjustment(Double adjustment) {
        this.adjustment = adjustment;
    }
}
