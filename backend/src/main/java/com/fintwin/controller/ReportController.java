package com.fintwin.controller;

import com.fintwin.dto.WeeklyReportDTO;

import com.fintwin.service.ReportService;

import org.springframework.web.bind.annotation.*;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@RestController

@RequestMapping("/api/v1/reports")


public class ReportController {

    private final ReportService
        reportService;

    // =====================================
    // CONSTRUCTOR
    // =====================================

    public ReportController(

        ReportService reportService

    ) {

        this.reportService =
            reportService;
    }

    // =====================================
    // GENERATE WEEKLY REPORT
    // =====================================

    @GetMapping("/weekly")

    public WeeklyReportDTO
    getWeeklyReport() {

        return reportService
            .generateWeeklyReport();
    }

    /** This week's report as the weekly agent wrote it; 204 when there isn't one yet. */
    @GetMapping("/weekly/latest")
    public ResponseEntity<WeeklyReportDTO> latestWeeklyReport() {
        return reportService.latestStored()
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    /** The weekly agent's trigger: write this week's report if it isn't there yet. */
    @PostMapping("/weekly/ensure")
    public java.util.Map<String, Object> ensureWeeklyReport() {
        return java.util.Map.of("written", reportService.ensureThisWeek());
    }

    @GetMapping(
        value="/weekly/pdf",
        produces=MediaType.APPLICATION_PDF_VALUE
    )
    public ResponseEntity<byte[]>
    downloadPdf() {

        return reportService
            .generatePdfReport();
    }
}