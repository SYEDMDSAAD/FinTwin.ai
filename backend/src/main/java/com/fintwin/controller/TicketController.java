package com.fintwin.controller;

import com.fintwin.service.TicketService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class TicketController {

    private final TicketService ticketService;

    public TicketController(TicketService ticketService) {
        this.ticketService = ticketService;
    }

    // ── Public: submit a ticket ───────────────────────────────────────────────

    @PostMapping("/api/v1/tickets")
    public ResponseEntity<?> submitTicket(@RequestBody Map<String, String> body) {
        String email   = body.get("email");
        String message = body.get("message");

        if (email == null || email.isBlank() || message == null || message.isBlank())
            return ResponseEntity.badRequest().body("Email and message are required.");

        var ticket = ticketService.submit(email, body.get("name"), body.get("category"), message);
        return ResponseEntity.ok(Map.of(
                "message",  "Ticket submitted. We'll get back to you soon.",
                "ticketId", ticket.getId()
        ));
    }

    // ── Admin: list all tickets ───────────────────────────────────────────────

    @GetMapping("/api/v1/admin/tickets")
    public ResponseEntity<?> listTickets(@RequestParam(required = false) String status) {
        return ResponseEntity.ok(ticketService.listAll(status));
    }

    // ── Admin: mark in-progress ───────────────────────────────────────────────

    @PutMapping("/api/v1/admin/tickets/{id}/in-progress")
    public ResponseEntity<?> markInProgress(@PathVariable Long id) {
        try {
            ticketService.markInProgress(id);
            return ResponseEntity.ok(Map.of("message", "Ticket marked as In Progress."));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ── Admin: resolve ticket ─────────────────────────────────────────────────

    @PutMapping("/api/v1/admin/tickets/{id}/resolve")
    public ResponseEntity<?> resolveTicket(@PathVariable Long id, @RequestBody Map<String, String> body) {
        try {
            ticketService.resolve(id, body.get("note"));
            return ResponseEntity.ok(Map.of("message", "Ticket resolved."));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ── Admin: reply to user by email ─────────────────────────────────────────

    @PostMapping("/api/v1/admin/tickets/{id}/reply")
    public ResponseEntity<?> replyToTicket(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String replyBody = body.get("reply");
        if (replyBody == null || replyBody.isBlank())
            return ResponseEntity.badRequest().body("Reply message is required.");

        try {
            ticketService.reply(id, replyBody);
            return ResponseEntity.ok(Map.of("message", "Reply sent."));
        } catch (IllegalStateException e) {
            return ResponseEntity.status(503).body(Map.of("error", e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    // ── Admin: delete ticket ──────────────────────────────────────────────────

    @DeleteMapping("/api/v1/admin/tickets/{id}")
    public ResponseEntity<?> deleteTicket(@PathVariable Long id) {
        try {
            ticketService.delete(id);
            return ResponseEntity.ok(Map.of("message", "Ticket deleted."));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
