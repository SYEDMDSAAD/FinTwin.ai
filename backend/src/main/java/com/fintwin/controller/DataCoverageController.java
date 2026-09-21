package com.fintwin.controller;

import com.fintwin.service.DataCoverageService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/data-coverage")
public class DataCoverageController {

    private final DataCoverageService service;

    public DataCoverageController(DataCoverageService service) {
        this.service = service;
    }

    /** Each account: live via alerts, statements up to a date, or missing months. */
    @GetMapping
    public List<Map<String, Object>> coverage() {
        return service.coverage();
    }
}
