package com.fintwin.model;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** What the import page guessed for a statement's columns, and what the user imported with. */
@Entity
@Table(name = "import_mapping_event")
@Getter
@Setter
@NoArgsConstructor
public class ImportMappingEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "format_key", length = 64)
    private String formatKey;

    @Column(columnDefinition = "TEXT")
    private String headers;

    @Column(name = "file_type", length = 10)
    private String fileType;

    @Column(name = "detected_format", length = 40)
    private String detectedFormat;

    @Column(name = "detected_mapping", columnDefinition = "TEXT")
    private String detectedMapping;

    @Column(name = "final_mapping", columnDefinition = "TEXT")
    private String finalMapping;

    private Boolean changed;

    @Column(name = "rows_imported")
    private Integer rowsImported;

    @Column(name = "created_at")
    private LocalDateTime createdAt;
}
