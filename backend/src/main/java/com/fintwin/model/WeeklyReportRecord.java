package com.fintwin.model;

import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** One user's weekly report for one week, as the weekly agent wrote it. */
@Entity
@Table(name = "weekly_report")
public class WeeklyReportRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** The Monday the week starts on (IST). */
    @Column(name = "week_start", nullable = false)
    private LocalDate weekStart;

    @Convert(converter = EncryptionConverter.class)
    @Column(name = "report", columnDefinition = "TEXT", nullable = false)
    private String report;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "viewed_at")
    private LocalDateTime viewedAt;

    @PrePersist
    protected void onCreate() { if (createdAt == null) createdAt = LocalDateTime.now(); }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public LocalDate getWeekStart() { return weekStart; }
    public void setWeekStart(LocalDate weekStart) { this.weekStart = weekStart; }
    public String getReport() { return report; }
    public void setReport(String report) { this.report = report; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getViewedAt() { return viewedAt; }
    public void setViewedAt(LocalDateTime viewedAt) { this.viewedAt = viewedAt; }
}
