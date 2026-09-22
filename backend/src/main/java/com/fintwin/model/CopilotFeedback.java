package com.fintwin.model;

import com.fintwin.security.EncryptionConverter;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** A copilot answer the user rated, with what produced it. Kept past the chat-history trim. */
@Entity
@Table(name = "copilot_feedback")
@Getter
@Setter
@NoArgsConstructor
public class CopilotFeedback {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "exchange_id")
    private Long exchangeId;

    @Convert(converter = EncryptionConverter.class)
    @Column(columnDefinition = "TEXT")
    private String question;

    @Convert(converter = EncryptionConverter.class)
    @Column(columnDefinition = "TEXT")
    private String answer;

    @Column(length = 64)
    private String mode;

    private Short rating;

    @Column(length = 40)
    private String reason;

    @Column(length = 30)
    private String path;

    @Column(columnDefinition = "TEXT")
    private String trace;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
