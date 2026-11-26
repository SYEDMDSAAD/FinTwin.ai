package com.fintwin.controller;

import com.fintwin.service.SmsImportService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Bank SMS from the Android app; see {@link SmsImportService}. */
@RestController
public class SmsImportController {

    private final SmsImportService service;

    public SmsImportController(SmsImportService service) {
        this.service = service;
    }

    public record SmsImportRequest(List<SmsImportService.Sms> messages) {}

    @PostMapping("/api/v1/sms/import")
    public SmsImportService.Result importSms(@RequestBody SmsImportRequest request) {
        return service.importMessages(request == null ? null : request.messages());
    }
}
