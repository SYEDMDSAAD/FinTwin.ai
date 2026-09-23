package com.fintwin.dto;

/**
 * Movement in one metric between the last two complete months.
 *
 * `goodDirection` exists because direction alone does not imply sentiment:
 * expenses rising and savings rising are both "up", and only one of them is
 * good news. The UI colours against this, not against the sign.
 */
public class ReportTrendDTO {

    private String label;
    private Double current;
    private Double previous;
    private Double changePercent;
    /** "up" | "down" | "flat" — which way the metric actually moved. */
    private String direction;
    /** "up" | "down" — which way is favourable for this metric. */
    private String goodDirection;

    public String getLabel()            { return label; }
    public void setLabel(String label)  { this.label = label; }

    public Double getCurrent()              { return current; }
    public void setCurrent(Double current)  { this.current = current; }

    public Double getPrevious()               { return previous; }
    public void setPrevious(Double previous)  { this.previous = previous; }

    public Double getChangePercent()                { return changePercent; }
    public void setChangePercent(Double v)          { this.changePercent = v; }

    public String getDirection()                { return direction; }
    public void setDirection(String direction)  { this.direction = direction; }

    public String getGoodDirection()            { return goodDirection; }
    public void setGoodDirection(String v)      { this.goodDirection = v; }
}
