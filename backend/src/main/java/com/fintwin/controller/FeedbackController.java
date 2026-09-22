package com.fintwin.controller;

import com.fintwin.exception.BadRequestException;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.service.TicketService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/** Beta feedback from the About App page. Signed-in users only. */
@RestController
@RequestMapping("/api/v1/feedback")
public class FeedbackController {

    private final TicketService ticketService;
    private final UserRepository userRepository;

    public FeedbackController(TicketService ticketService, UserRepository userRepository) {
        this.ticketService = ticketService;
        this.userRepository = userRepository;
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> submit(@RequestBody Map<String, Object> body) {
        String email = SecurityUtils.getCurrentUserEmail();
        String name = userRepository.findByEmail(email).map(User::getFullName).orElse("");

        var ticket = ticketService.submitFeedback(email, name,
                rating(body.get("rating")), useful(body.get("useful")),
                text(body.get("improve")), text(body.get("broken")));
        return ResponseEntity.ok(Map.of("message", "Thanks for the feedback!", "ticketId", ticket.getId()));
    }

    private static Integer rating(Object v) {
        if (v == null) return null;
        if (v instanceof Number n && n.doubleValue() == n.intValue()) return n.intValue();
        throw new BadRequestException("Rating must be a whole number");
    }

    private static List<String> useful(Object v) {
        if (v == null) return List.of();
        if (!(v instanceof List<?> list)) throw new BadRequestException("useful must be a list");
        return list.stream().map(o -> o == null ? null : o.toString()).toList();
    }

    private static String text(Object v) {
        if (v == null) return null;
        if (!(v instanceof String s)) throw new BadRequestException("Answers must be text");
        return s;
    }
}
