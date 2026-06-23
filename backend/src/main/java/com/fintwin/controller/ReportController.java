package com.fintwin.controller;

import com.fintwin.dto.WeeklyReportDTO;

import com.fintwin.service.ReportService;

import org.springframework.web.bind.annotation.*;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@RestController

@RequestMapping("/api/reports")


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