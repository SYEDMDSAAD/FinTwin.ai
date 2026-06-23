package com.fintwin.controller;

import com.fintwin.dto.InvestmentDTO;
import com.fintwin.dto.PortfolioSummaryDTO;
import com.fintwin.model.Investment;
import com.fintwin.service.InvestmentService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/portfolio")
public class InvestmentController {

    private final InvestmentService service;

    public InvestmentController(InvestmentService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<PortfolioSummaryDTO> getSummary() {
        return ResponseEntity.ok(service.getSummary());
    }

    @GetMapping("/auto-detect")
    public ResponseEntity<List<InvestmentDTO>> autoDetect() {
        return ResponseEntity.ok(service.autoDetect());
    }

    @PostMapping("/refresh")
    public ResponseEntity<PortfolioSummaryDTO> refreshPrices() {
        return ResponseEntity.ok(service.refreshPrices());
    }

    @PostMapping
    public ResponseEntity<InvestmentDTO> add(@RequestBody Investment investment) {
        return ResponseEntity.ok(service.add(investment));
    }

    @PutMapping("/{id}")
    public ResponseEntity<InvestmentDTO> update(@PathVariable Long id, @RequestBody Investment investment) {
        return ResponseEntity.ok(service.update(id, investment));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
