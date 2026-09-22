package com.fintwin.controller;

import com.fintwin.service.ImportFeedbackService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
public class ImportFeedbackController {

    private final ImportFeedbackService service;

    public ImportFeedbackController(ImportFeedbackService service) {
        this.service = service;
    }

    /** After an import: the statement's header row, the page's guess and the mapping used. */
    @PostMapping("/api/v1/imports/mapping-feedback")
    public Map<String, Object> record(@RequestBody Map<String, Object> body) {
        return service.record(body);
    }

    /** Admin: statement formats, most often fixed by hand first. */
    @GetMapping("/api/v1/admin/imports/formats")
    public List<Map<String, Object>> formats() {
        return service.formats();
    }
}
