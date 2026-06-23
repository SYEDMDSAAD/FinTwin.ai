package com.fintwin.dto;

import java.time.LocalDateTime;
import java.util.List;

public class UserDetailDTO {
    private Long id;
    private String fullName;
    private String email;
    private String role;
    private Boolean enabled;
    private LocalDateTime createdAt;
    private LocalDateTime lastLoginAt;
    private Boolean onboardingCompleted;
    private Boolean twoFactorEnabled;
    private long transactionCount;
    private long goalCount;
    private long chatCount;
    private boolean hasBankConnected;
    private List<AuditLogDTO> recentActivity;

    public Long getId()                         { return id; }
    public void setId(Long id)                  { this.id = id; }
    public String getFullName()                 { return fullName; }
    public void setFullName(String v)           { this.fullName = v; }
    public String getEmail()                    { return email; }
    public void setEmail(String v)              { this.email = v; }
    public String getRole()                     { return role; }
    public void setRole(String v)               { this.role = v; }
    public Boolean getEnabled()                 { return enabled; }
    public void setEnabled(Boolean v)           { this.enabled = v; }
    public LocalDateTime getCreatedAt()         { return createdAt; }
    public void setCreatedAt(LocalDateTime v)   { this.createdAt = v; }
    public LocalDateTime getLastLoginAt()       { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime v) { this.lastLoginAt = v; }
    public Boolean getOnboardingCompleted()     { return onboardingCompleted; }
    public void setOnboardingCompleted(Boolean v){ this.onboardingCompleted = v; }
    public Boolean getTwoFactorEnabled()        { return twoFactorEnabled; }
    public void setTwoFactorEnabled(Boolean v)  { this.twoFactorEnabled = v; }
    public long getTransactionCount()           { return transactionCount; }
    public void setTransactionCount(long v)     { this.transactionCount = v; }
    public long getGoalCount()                  { return goalCount; }
    public void setGoalCount(long v)            { this.goalCount = v; }
    public long getChatCount()                  { return chatCount; }
    public void setChatCount(long v)            { this.chatCount = v; }
    public boolean isHasBankConnected()         { return hasBankConnected; }
    public void setHasBankConnected(boolean v)  { this.hasBankConnected = v; }
    public List<AuditLogDTO> getRecentActivity(){ return recentActivity; }
    public void setRecentActivity(List<AuditLogDTO> v){ this.recentActivity = v; }
}
