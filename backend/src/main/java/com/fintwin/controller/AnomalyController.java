package com.fintwin.controller;

import com.fintwin.dto.AnomalyDTO;
import com.fintwin.dto.DismissAnomalyRequest;
import com.fintwin.service.AnomalyService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/anomalies")
public class AnomalyController {

    private final AnomalyService anomalyService;

    public AnomalyController(AnomalyService anomalyService) {
        this.anomalyService = anomalyService;
    }

    @GetMapping
    public List<AnomalyDTO> getAnomalies() {
        return anomalyService.detectAnomalies();
    }

    @PostMapping("/dismiss")
    public ResponseEntity<Void> dismiss(@RequestBody DismissAnomalyRequest req) {
        anomalyService.dismissAnomaly(req);
        return ResponseEntity.noContent().build();
    }
}
