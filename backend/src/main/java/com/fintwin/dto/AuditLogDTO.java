package com.fintwin.dto;

import com.fintwin.audit.AuditLog;
import java.time.LocalDateTime;

public class AuditLogDTO {
    private Long id;
    private Long userId;
    private String action;
    private String resource;
    private String description;
    private String ipAddress;
    private String httpMethod;
    private String requestUri;
    private LocalDateTime timestamp;
    private boolean success;
    private String failureReason;

    public static AuditLogDTO from(AuditLog a) {
        AuditLogDTO d = new AuditLogDTO();
        d.id = a.getId();
        d.userId = a.getUserId();
        d.action = a.getAction();
        d.resource = a.getResource();
        d.description = a.getDescription();
        d.ipAddress = a.getIpAddress();
        d.httpMethod = a.getHttpMethod();
        d.requestUri = a.getRequestUri();
        d.timestamp = a.getTimestamp();
        d.success = a.isSuccess();
        d.failureReason = a.getFailureReason();
        return d;
    }

    public Long getId()             { return id; }
    public Long getUserId()         { return userId; }
    public String getAction()       { return action; }
    public String getResource()     { return resource; }
    public String getDescription()  { return description; }
    public String getIpAddress()    { return ipAddress; }
    public String getHttpMethod()   { return httpMethod; }
    public String getRequestUri()   { return requestUri; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public boolean isSuccess()      { return success; }
    public String getFailureReason() { return failureReason; }
}
