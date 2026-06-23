package com.fintwin.model;

import jakarta.persistence.*;
import lombok.*;
import com.fintwin.security.EncryptionConverter;

import java.time.LocalDateTime;

@Entity
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor

public class ChatHistory {

    @Id

    @GeneratedValue(
        strategy = GenerationType.IDENTITY
    )

    private Long id;

    private String role;

    @Convert(converter = EncryptionConverter.class)
    @Column(
        columnDefinition = "TEXT"
    )

    private String message;

    @Convert(converter = EncryptionConverter.class)
    @Column(
        columnDefinition = "TEXT"
    )

    private String reply;

    private LocalDateTime timestamp;

    @ManyToOne
    @JoinColumn(name = "user_id")
    @com.fasterxml.jackson.annotation.JsonIgnore
    private User user;

    // =========================
    // GETTERS & SETTERS
    // =========================

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(
        String message
    ) {
        this.message = message;
    }

    public String getReply() {
        return reply;
    }

    public void setReply(
        String reply
    ) {
        this.reply = reply;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(
        LocalDateTime timestamp
    ) {
        this.timestamp = timestamp;
    }
    
}