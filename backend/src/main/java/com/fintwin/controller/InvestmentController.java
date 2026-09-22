package com.fintwin.controller;

import com.fintwin.dto.InvestmentDTO;
import com.fintwin.dto.PortfolioSummaryDTO;
import com.fintwin.model.Investment;
import com.fintwin.service.InvestmentService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/portfolio")
public class InvestmentController {

    private final InvestmentService service;
    private final com.fintwin.service.HoldingLinkService linkService;

    public InvestmentController(InvestmentService service, com.fintwin.service.HoldingLinkService linkService) {
        this.service = service;
        this.linkService = linkService;
    }

    @GetMapping
    public ResponseEntity<PortfolioSummaryDTO> getSummary() {
        return ResponseEntity.ok(service.getSummary());
    }

    @GetMapping("/auto-detect")
    public ResponseEntity<List<InvestmentDTO>> autoDetect() {
        return ResponseEntity.ok(service.autoDetect());
    }

    /** What an amount invested on a date is worth today — shown before linking. */
    @PostMapping("/value-preview")
    public ResponseEntity<Map<String, Object>> valuePreview(@RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(linkService.preview(str(body.get("kind")), str(body.get("symbol")),
                date(body.get("date")), num(body.get("amount")), num(body.get("units"))));
    }

    /** Re-point a holding (e.g. the onboarding sum) at the stock or fund it really is. */
    @PostMapping("/{id}/link")
    public ResponseEntity<InvestmentDTO> link(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(linkService.link(id, str(body.get("kind")), str(body.get("symbol")),
                str(body.get("name")), date(body.get("date")), num(body.get("amount")), num(body.get("units"))));
    }

    private static String str(Object o) { return o == null ? null : o.toString(); }

    private static Double num(Object o) {
        if (o == null || o.toString().isBlank()) return null;
        try { return Double.valueOf(o.toString()); } catch (NumberFormatException e) {
            throw new com.fintwin.exception.BadRequestException("Not a number: " + o);
        }
    }

    private static java.time.LocalDate date(Object o) {
        if (o == null || o.toString().isBlank()) return null;
        try { return java.time.LocalDate.parse(o.toString()); } catch (java.time.format.DateTimeParseException e) {
            throw new com.fintwin.exception.BadRequestException("Dates must be YYYY-MM-DD");
        }
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
