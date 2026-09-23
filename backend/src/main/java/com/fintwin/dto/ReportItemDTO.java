package com.fintwin.dto;

/**
 * One finding in an executive report — an insight, a risk or a recommendation.
 *
 * The report used to carry each section as a single prose string with two
 * sentences run together, which left the UI nothing to rank, badge or lay out.
 * A finding is a unit, so it is modelled as one.
 */
public class ReportItemDTO {

    private String title;
    private String detail;
    /** "high" | "medium" | "low" — drives ordering and colour. */
    private String severity;

    public ReportItemDTO() {
    }

    public ReportItemDTO(String title, String detail, String severity) {
        this.title    = title;
        this.detail   = detail;
        this.severity = severity;
    }

    public String getTitle()              { return title; }
    public void setTitle(String title)    { this.title = title; }

    public String getDetail()             { return detail; }
    public void setDetail(String detail)  { this.detail = detail; }

    public String getSeverity()               { return severity; }
    public void setSeverity(String severity)  { this.severity = severity; }
}
