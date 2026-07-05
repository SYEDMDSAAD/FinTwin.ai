package com.fintwin.dto;

import java.util.List;

public class CreditScoreDTO {

    private int score;
    private String band;
    private String bandColor;
    private List<FactorDTO> factors;
    // Must be displayed wherever the score is shown — this is an internal
    // estimate, not a bureau (CIBIL/Experian/Equifax) score.
    private String disclaimer;

    public static class FactorDTO {
        private String label;
        private String impact;
        private int points;
        private int maxPoints;
        private String status; // "good", "warning", "poor"
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

    public CreditScoreDTO(int score, String band, String bandColor, List<FactorDTO> factors, String disclaimer) {
        this.score      = score;
        this.band       = band;
        this.bandColor  = bandColor;
        this.factors    = factors;
        this.disclaimer = disclaimer;
    }

    public int              getScore()      { return score; }
    public String           getBand()       { return band; }
    public String           getBandColor()  { return bandColor; }
    public List<FactorDTO>  getFactors()    { return factors; }
    public String           getDisclaimer() { return disclaimer; }
}
