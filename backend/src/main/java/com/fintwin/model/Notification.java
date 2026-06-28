package com.fintwin.model;

import jakarta.persistence.*;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fintwin.security.EncryptionConverter;

@Entity
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)

    private Long id;

    private String type;

    @Convert(converter = EncryptionConverter.class)
    @Column(length = 4100)
    private String message;

    private boolean readStatus;

    private LocalDateTime createdAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    @JsonIgnore
    private User user;

    // =====================================
    // GETTERS & SETTERS
    // =====================================

    public Long getId() {

        return id;
    }

    public void setId(Long id) {

        this.id = id;
    }

    public String getType() {

        return type;
    }

    public void setType(String type) {

        this.type = type;
    }

    public String getMessage() {

        return message;
    }

    public void setMessage(String message) {

        this.message = message;
    }

    public boolean isReadStatus() {

        return readStatus;
    }

    public void setReadStatus(boolean readStatus) {

        this.readStatus = readStatus;
    }

    public LocalDateTime getCreatedAt() {

        return createdAt;
    }

    public void setCreatedAt(
            LocalDateTime createdAt
    ) {

        this.createdAt = createdAt;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }
}