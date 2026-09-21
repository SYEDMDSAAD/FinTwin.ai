package com.fintwin.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * "What have I spent since I last looked" — the daily view, in plain language.
 */
public class DailyRecapDTO {

    /** One sentence: "You spent ₹3,240 since Tuesday." */
    private String headline;

    /** "since Tuesday", "today", "in the last week" — reusable in UI copy. */
    private String periodLabel;

    /** Two or three supporting sentences. Never a wall of text. */
    private List<String> lines;

    private double totalSpent;

    private int chargeCount;

    /** True when the user has never opened the recap, so the window is a default. */
    private boolean firstVisit;

    private LocalDateTime lastSeenAt;

    /** The charges themselves, newest first — the recap explains, the list evidences. */
    private List<RecapChargeDTO> charges;

    /** Recurring charges landing within the week. */
    private List<UpcomingChargeDTO> upcoming;

    public static class RecapChargeDTO {

        private String    merchant;
        private double    amount;
        private String    category;
        private LocalDate date;
        /** "BANK", "CARD", "STATEMENT", "MANUAL" — which rail this came from. */
        private String    source;

        public RecapChargeDTO() {}

        public RecapChargeDTO(String merchant, double amount, String category,
                              LocalDate date, String source) {
            this.merchant = merchant;
            this.amount   = amount;
            this.category = category;
            this.date     = date;
            this.source   = source;
        }

        public String    getMerchant() { return merchant; }
        public double    getAmount()   { return amount;   }
        public String    getCategory() { return category; }
        public LocalDate getDate()     { return date;     }
        public String    getSource()   { return source;   }

        public void setMerchant(String merchant) { this.merchant = merchant; }
        public void setAmount(double amount)     { this.amount   = amount;   }
        public void setCategory(String category) { this.category = category; }
        public void setDate(LocalDate date)      { this.date     = date;     }
        public void setSource(String source)     { this.source   = source;   }
    }

    public static class UpcomingChargeDTO {

        private String    merchant;
        private double    amount;
        private LocalDate dueDate;
        private String    cadence;

        public UpcomingChargeDTO() {}

        public UpcomingChargeDTO(String merchant, double amount, LocalDate dueDate, String cadence) {
            this.merchant = merchant;
            this.amount   = amount;
            this.dueDate  = dueDate;
            this.cadence  = cadence;
        }

        public String    getMerchant() { return merchant; }
        public double    getAmount()   { return amount;   }
        public LocalDate getDueDate()  { return dueDate;  }
        public String    getCadence()  { return cadence;  }

        public void setMerchant(String merchant) { this.merchant = merchant; }
        public void setAmount(double amount)     { this.amount   = amount;   }
        public void setDueDate(LocalDate dueDate){ this.dueDate  = dueDate;  }
        public void setCadence(String cadence)   { this.cadence  = cadence;  }
    }

    // Getters & Setters

    public String getHeadline() { return headline; }
    public void setHeadline(String headline) { this.headline = headline; }

    public String getPeriodLabel() { return periodLabel; }
    public void setPeriodLabel(String periodLabel) { this.periodLabel = periodLabel; }

    public List<String> getLines() { return lines; }
    public void setLines(List<String> lines) { this.lines = lines; }

    public double getTotalSpent() { return totalSpent; }
    public void setTotalSpent(double totalSpent) { this.totalSpent = totalSpent; }

    public int getChargeCount() { return chargeCount; }
    public void setChargeCount(int chargeCount) { this.chargeCount = chargeCount; }

    public boolean isFirstVisit() { return firstVisit; }
    public void setFirstVisit(boolean firstVisit) { this.firstVisit = firstVisit; }

    public LocalDateTime getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(LocalDateTime lastSeenAt) { this.lastSeenAt = lastSeenAt; }

    public List<RecapChargeDTO> getCharges() { return charges; }
    public void setCharges(List<RecapChargeDTO> charges) { this.charges = charges; }

    public List<UpcomingChargeDTO> getUpcoming() { return upcoming; }
    public void setUpcoming(List<UpcomingChargeDTO> upcoming) { this.upcoming = upcoming; }
}
