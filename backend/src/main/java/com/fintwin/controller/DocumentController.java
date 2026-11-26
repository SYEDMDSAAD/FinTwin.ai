package com.fintwin.controller;

import com.fintwin.service.DocumentExtractService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/** Reads a policy or loan PDF into form fields for the user to check. Saves nothing. */
@RestController
@RequestMapping("/api/v1/documents")
public class DocumentController {

    private final DocumentExtractService service;

    public DocumentController(DocumentExtractService service) {
        this.service = service;
    }

    @PostMapping("/extract")
    public Map<String, Object> extract(@RequestParam("file") MultipartFile file,
                                       @RequestParam("kind") String kind,
                                       @RequestParam(value = "password", required = false) String password) {
        return service.extract(file, kind, password);
    }
}
