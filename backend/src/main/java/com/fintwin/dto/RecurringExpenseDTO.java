package com.fintwin.dto;

import java.time.LocalDate;

/**
 * One detected recurring charge.
 *
 * merchant/amount/occurrences are unchanged so existing callers keep working;
 * the rest is what turns detection into something a user can act on. "₹199"
 * is a fact about the past — "₹2,388 a year, next charge 14 Sep" is what makes
 * someone cancel.
 */
public class RecurringExpenseDTO {

    private String merchant;

    /** Typical (median) charge — robust to a one-off price change. */
    private double amount;

    private int occurrences;

    /** "Weekly", "Monthly", "Quarterly", "Yearly", … */
    private String cadence;

    /** What this costs over twelve months at the detected cadence. */
    private double annualisedCost;

    private LocalDate lastCharged;

    private LocalDate nextChargeDate;

    /** True for usage-based bills, so the UI can show "varies" beside the amount. */
    private boolean amountVaries;

    /** False once a charge is overdue by more than a cycle — likely cancelled. */
    private boolean active;

    // Getters & Setters

    public String getMerchant() {
        return merchant;
    }

    public void setMerchant(String merchant) {
        this.merchant = merchant;
    }

    public double getAmount() {
        return amount;
    }

    public void setAmount(double amount) {
        this.amount = amount;
    }

    public int getOccurrences() {
        return occurrences;
    }

    public void setOccurrences(int occurrences) {
        this.occurrences = occurrences;
    }

    public String getCadence() {
        return cadence;
    }

    public void setCadence(String cadence) {
        this.cadence = cadence;
    }

    public double getAnnualisedCost() {
        return annualisedCost;
    }

    public void setAnnualisedCost(double annualisedCost) {
        this.annualisedCost = annualisedCost;
    }

    public LocalDate getLastCharged() {
        return lastCharged;
    }

    public void setLastCharged(LocalDate lastCharged) {
        this.lastCharged = lastCharged;
    }

    public LocalDate getNextChargeDate() {
        return nextChargeDate;
    }

    public void setNextChargeDate(LocalDate nextChargeDate) {
        this.nextChargeDate = nextChargeDate;
    }

    public boolean isAmountVaries() {
        return amountVaries;
    }

    public void setAmountVaries(boolean amountVaries) {
        this.amountVaries = amountVaries;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
