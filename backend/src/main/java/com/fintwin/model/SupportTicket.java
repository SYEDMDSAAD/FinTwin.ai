package com.fintwin.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import java.time.LocalDateTime;

@Entity
@Table(name = "support_tickets")
public class SupportTicket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_email", nullable = false, length = 512)
    private String userEmail;

    @Column(name = "user_name", length = 200)
    private String userName;

    @Column(name = "category", length = 50)
    private String category;   // LOGIN_ISSUE, ACCOUNT_BLOCKED, BUG, BILLING, OTHER

    @Column(name = "message", nullable = false, length = 2000)
    private String message;

    @Column(name = "status", length = 20)
    private String status = "OPEN";   // OPEN, IN_PROGRESS, RESOLVED

    @Column(name = "admin_note", length = 2000)
    private String adminNote;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    public Long getId()                       { return id; }
    public String getUserEmail()              { return userEmail; }
    public void setUserEmail(String v)        { this.userEmail = v; }
    public String getUserName()               { return userName; }
    public void setUserName(String v)         { this.userName = v; }
    public String getCategory()               { return category; }
    public void setCategory(String v)         { this.category = v; }
    public String getMessage()                { return message; }
    public void setMessage(String v)          { this.message = v; }
    public String getStatus()                 { return status; }
    public void setStatus(String v)           { this.status = v; }
    public String getAdminNote()              { return adminNote; }
    public void setAdminNote(String v)        { this.adminNote = v; }
    public LocalDateTime getCreatedAt()       { return createdAt; }
    public LocalDateTime getResolvedAt()      { return resolvedAt; }
    public void setResolvedAt(LocalDateTime v){ this.resolvedAt = v; }
}
