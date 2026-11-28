package com.fintwin.controller;

import com.fintwin.service.SmsImportService;
import com.fintwin.service.SmsShortcutService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Bank SMS: in batches from the Android app ({@link SmsImportService}), and one
 * at a time from an iPhone Shortcut signed with the user's import key
 * ({@link SmsShortcutService}).
 */
@RestController
public class SmsImportController {

    private final SmsImportService service;
    private final SmsShortcutService shortcut;

    public SmsImportController(SmsImportService service, SmsShortcutService shortcut) {
        this.service = service;
        this.shortcut = shortcut;
    }

    /** What the Shortcut sends: the message text, and who sent it if the phone says. */
    public record ShortcutMessage(String sender, String message, Long receivedAt) {}

    public record SmsImportRequest(List<SmsImportService.Sms> messages) {}

    @PostMapping("/api/v1/sms/import")
    public SmsImportService.Result importSms(@RequestBody SmsImportRequest request) {
        return service.importMessages(request == null ? null : request.messages());
    }

    @GetMapping("/api/v1/sms/shortcut-key")
    public Map<String, String> shortcutKey() {
        return Map.of("key", shortcut.key());
    }

    @PostMapping("/api/v1/sms/shortcut-key/rotate")
    public Map<String, String> rotateShortcutKey() {
        return Map.of("key", shortcut.rotate());
    }

    /** Public: signed with the X-FinTwin-Key header instead of a login. */
    @PostMapping("/api/v1/sms/shortcut")
    public SmsImportService.Result fromShortcut(@RequestHeader(value = "X-FinTwin-Key", required = false) String key,
                                                @RequestBody(required = false) ShortcutMessage body) {
        return shortcut.importOne(key, body == null ? null : body.sender(),
                body == null ? null : body.message(), body == null ? null : body.receivedAt());
    }
}
