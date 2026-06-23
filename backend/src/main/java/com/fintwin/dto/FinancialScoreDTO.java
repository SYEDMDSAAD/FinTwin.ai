package com.fintwin.dto;

import java.util.List;

public class FinancialScoreDTO {

    private int score;
    private String rating;
    private double savingsRatio;
    private int budgetDiscipline;
    private int recurringExpenseCount;
    private List<FactorDTO> factors;

    public static class FactorDTO {
        private String label;
        private String impact;
        private int    points;
        private int    maxPoints;
        private String status;
        private String desc;

        public FactorDTO(String label, String impact, int points, int maxPoints, String status, String desc) {
            this.label     = label;
            this.impact    = impact;
            this.points    = points;
            this.maxPoints = maxPoints;
            this.status    = status;
            this.desc      = desc;
        }

        public String getLabel()     { return label; }
        public String getImpact()    { return impact; }
        public int    getPoints()    { return points; }
        public int    getMaxPoints() { return maxPoints; }
        public String getStatus()    { return status; }
        public String getDesc()      { return desc; }
    }

    public FinancialScoreDTO(
        int score,
        String rating,
        double savingsRatio,
        int budgetDiscipline,
        int recurringExpenseCount
    ) {
        this.score                = score;
        this.rating               = rating;
        this.savingsRatio         = savingsRatio;
        this.budgetDiscipline     = budgetDiscipline;
        this.recurringExpenseCount = recurringExpenseCount;
    }

    public FinancialScoreDTO(
        int score,
        String rating,
        double savingsRatio,
        int budgetDiscipline,
        int recurringExpenseCount,
        List<FactorDTO> factors
    ) {
        this(score, rating, savingsRatio, budgetDiscipline, recurringExpenseCount);
        this.factors = factors;
    }

    public int             getScore()                { return score; }
    public String          getRating()               { return rating; }
    public double          getSavingsRatio()         { return savingsRatio; }
    public int             getBudgetDiscipline()     { return budgetDiscipline; }
    public int             getRecurringExpenseCount(){ return recurringExpenseCount; }
    public List<FactorDTO> getFactors()              { return factors; }
}
