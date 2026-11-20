package com.fintwin.model;

import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/**
 * Spend Guard's records for one user (wallet, decisions, wishlist, plans), kept as
 * the JSON document the guard service works with. Both columns are encrypted;
 * FinTwin only stores them and reads {@code summary} for the Copilot.
 */
@Entity
@Table(name = "spend_guard_state")
@Getter
@Setter
@NoArgsConstructor
public class SpendGuardState {

    @Id
    @Column(name = "user_id")
    private Long userId;

    @Convert(converter = EncryptionConverter.class)
    @Column(columnDefinition = "TEXT", nullable = false)
    private String state;

    @Convert(converter = EncryptionConverter.class)
    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
