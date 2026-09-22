package com.fintwin.controller;

import com.fintwin.audit.Audited;
import com.fintwin.service.TrainingExportService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;

/** Admin: anonymised training data from users who opted in (see TrainingExportService). */
@RestController
@RequestMapping("/api/v1/admin/training-export")
public class TrainingExportController {

    private final TrainingExportService service;

    public TrainingExportController(TrainingExportService service) {
        this.service = service;
    }

    @GetMapping
    public Map<String, Integer> counts() {
        return service.counts();
    }

    @GetMapping("/{dataset}")
    @Audited(action = "READ", resource = "training-export", description = "Anonymised training data exported")
    public ResponseEntity<byte[]> export(@PathVariable String dataset) {
        String body = String.join("\n", service.export(dataset));
        if (!body.isEmpty()) body += "\n";
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("application/x-ndjson"))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"fintwin-" + dataset + "-" + LocalDate.now() + ".jsonl\"")
                .body(body.getBytes(StandardCharsets.UTF_8));
    }
}
