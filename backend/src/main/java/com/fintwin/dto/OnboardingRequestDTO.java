package com.fintwin.dto;

import jakarta.validation.constraints.Min;

import java.util.List;

public class OnboardingRequestDTO {

    // Present only on manual-path onboarding — used to seed synthetic transactions
    @Min(value = 0, message = "Income cannot be negative")
    private Double incomeLast3Months;

    @Min(value = 0, message = "Expenses cannot be negative")
    private Double expensesLast3Months;

    @Min(value = 0, message = "Savings cannot be negative")
    private Double savings;

    @Min(value = 0, message = "Investments cannot be negative")
    private Double investments;

    @Min(value = 0, message = "Debt cannot be negative")
    private Double debt;

    // Number of months the user provided data for (manual path, min 2)
    // Used to correctly compute monthly savings and to scale transaction seeding
    private Integer numberOfMonths;

    private List<String> goals;

    public Double getIncomeLast3Months()   { return incomeLast3Months; }
    public void   setIncomeLast3Months(Double v) { this.incomeLast3Months = v; }

    public Double getExpensesLast3Months() { return expensesLast3Months; }
    public void   setExpensesLast3Months(Double v) { this.expensesLast3Months = v; }

    public Integer getNumberOfMonths()        { return numberOfMonths; }
    public void    setNumberOfMonths(Integer v){ this.numberOfMonths = v; }

    public Double getSavings()     { return savings     != null ? savings     : 0.0; }
    public void   setSavings(Double v)     { this.savings = v; }

    public Double getInvestments() { return investments != null ? investments : 0.0; }
    public void   setInvestments(Double v) { this.investments = v; }

    public Double getDebt()        { return debt        != null ? debt        : 0.0; }
    public void   setDebt(Double v)        { this.debt = v; }

    public List<String> getGoals() { return goals; }
    public void         setGoals(List<String> goals) { this.goals = goals; }
}
