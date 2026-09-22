package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.SupportTicket;
import com.fintwin.repository.SupportTicketRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class TicketService {

    @Autowired
    private SupportTicketRepository ticketRepository;

    @Autowired
    private EmailService emailService;

    public SupportTicket submit(String email, String name, String category, String message) {
        SupportTicket ticket = new SupportTicket();
        ticket.setUserEmail(email.trim().toLowerCase());
        ticket.setUserName(name != null ? name.trim() : "");
        ticket.setCategory(category != null ? category : "OTHER");
        ticket.setMessage(message.trim());
        ticket.setStatus("OPEN");
        return ticketRepository.save(ticket);
    }

    public static final String FEEDBACK = "FEEDBACK";
    static final int MAX_TEXT = 2000;

    /**
     * Beta feedback from a signed-in user, filed as a ticket so it lands in the
     * admin's Support Tickets queue. The email comes from the session, never the
     * request, so feedback can't be filed in someone else's name.
     */
    public SupportTicket submitFeedback(String email, String name, Integer rating,
                                        List<String> useful, String improve, String broken) {
        return submit(email, name, FEEDBACK, feedbackMessage(rating, useful, improve, broken));
    }

    static String feedbackMessage(Integer rating, List<String> useful, String improve, String broken) {
        if (rating == null || rating < 1 || rating > 5)
            throw new BadRequestException("Rating must be between 1 and 5");
        if (useful != null && useful.size() > 20)
            throw new BadRequestException("Too many features selected");
        for (String text : new String[]{improve, broken})
            if (text != null && text.length() > MAX_TEXT)
                throw new BadRequestException("Keep each answer under " + MAX_TEXT + " characters");

        StringBuilder m = new StringBuilder("Rating: ").append(rating).append("/5");
        if (useful != null && !useful.isEmpty()) {
            List<String> names = useful.stream()
                    .filter(u -> u != null && !u.isBlank())
                    .map(u -> u.trim().length() > 40 ? u.trim().substring(0, 40) : u.trim())
                    .toList();
            if (!names.isEmpty()) m.append("\n").append(USEFUL).append(String.join(", ", names));
        }
        if (improve != null && !improve.isBlank()) m.append(IMPROVE).append(improve.trim());
        if (broken != null && !broken.isBlank())   m.append(BROKEN).append(broken.trim());
        return m.toString();
    }

    static final String USEFUL = "Most useful: ";
    static final String IMPROVE = "\n\nWhat to improve:\n";
    static final String BROKEN = "\n\nWhat didn't work:\n";

    /** One feedback ticket read back into its answers. */
    public record Feedback(Long id, String email, String name, LocalDateTime submittedAt, String status,
                           Integer rating, List<String> useful, String improve, String broken) {}

    /**
     * Reverses {@link #feedbackMessage}. The answers are free text, so a user
     * could type a heading themselves; the last "What didn't work" heading is
     * the one we wrote, since it always comes after the user's improve text.
     */
    static Feedback parseFeedback(SupportTicket t) {
        String m = t.getMessage() == null ? "" : t.getMessage();
        Integer rating = null;
        var r = java.util.regex.Pattern.compile("^Rating: ([1-5])/5").matcher(m);
        if (r.find()) rating = Integer.parseInt(r.group(1));

        String broken = null;
        int b = m.lastIndexOf(BROKEN);
        if (b >= 0) { broken = m.substring(b + BROKEN.length()); m = m.substring(0, b); }
        String improve = null;
        int i = m.indexOf(IMPROVE);
        if (i >= 0) { improve = m.substring(i + IMPROVE.length()); m = m.substring(0, i); }
        List<String> useful = List.of();
        int u = m.indexOf("\n" + USEFUL);
        if (u >= 0) useful = List.of(m.substring(u + 1 + USEFUL.length()).split(", "));

        return new Feedback(t.getId(), t.getUserEmail(), t.getUserName(), t.getCreatedAt(), t.getStatus(),
                rating, useful, improve, broken);
    }

    /** Every piece of feedback, grouped by the user who sent it, plus totals. */
    public Map<String, Object> feedbackReport() {
        List<Feedback> all = ticketRepository.findByCategoryOrderByCreatedAtDescIdDesc(FEEDBACK).stream()
                .map(TicketService::parseFeedback).toList();

        Map<String, List<Feedback>> byUser = new LinkedHashMap<>();       // newest-first order kept
        for (Feedback f : all) byUser.computeIfAbsent(f.email(), k -> new ArrayList<>()).add(f);

        List<Map<String, Object>> users = new ArrayList<>();
        byUser.forEach((email, list) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("email", email);
            row.put("name", list.stream().map(Feedback::name).filter(n -> n != null && !n.isBlank()).findFirst().orElse(""));
            row.put("count", list.size());
            row.put("latestRating", list.get(0).rating());
            row.put("lastSubmittedAt", list.get(0).submittedAt());
            row.put("feedback", list);
            users.add(row);
        });

        int[] dist = new int[6];
        Map<String, Integer> features = new LinkedHashMap<>();
        for (Feedback f : all) {
            if (f.rating() != null) dist[f.rating()]++;
            for (String name : f.useful()) features.merge(name, 1, Integer::sum);
        }
        double avg = all.stream().filter(f -> f.rating() != null).mapToInt(Feedback::rating).average().orElse(0);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", all.size());
        out.put("userCount", users.size());
        out.put("averageRating", Math.round(avg * 10) / 10.0);
        out.put("ratingCounts", Map.of(1, dist[1], 2, dist[2], 3, dist[3], 4, dist[4], 5, dist[5]));
        out.put("topFeatures", features.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .map(e -> Map.of("name", e.getKey(), "count", e.getValue())).toList());
        out.put("users", users);
        return out;
    }

    public Map<String, Object> listAll(String status) {
        List<SupportTicket> tickets = (status != null && !status.isBlank())
                ? ticketRepository.findByStatusOrderByCreatedAtDesc(status)
                : ticketRepository.findAllByOrderByCreatedAtDesc();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tickets",         tickets);
        result.put("openCount",        ticketRepository.countByStatus("OPEN"));
        result.put("inProgressCount",  ticketRepository.countByStatus("IN_PROGRESS"));
        result.put("resolvedCount",    ticketRepository.countByStatus("RESOLVED"));
        return result;
    }

    public SupportTicket markInProgress(Long id) {
        SupportTicket t = findOrThrow(id);
        t.setStatus("IN_PROGRESS");
        return ticketRepository.save(t);
    }

    public SupportTicket resolve(Long id, String note) {
        SupportTicket t = findOrThrow(id);
        t.setStatus("RESOLVED");
        t.setAdminNote(note != null ? note : "");
        t.setResolvedAt(LocalDateTime.now());
        return ticketRepository.save(t);
    }

    public void reply(Long id, String replyBody) {
        SupportTicket t = findOrThrow(id);

        if (!emailService.isConfigured()) {
            throw new IllegalStateException(
                "Email not configured. Set MAIL_ENABLED=true and MAIL_USERNAME/MAIL_PASSWORD in .env. replyFor=" + t.getUserEmail()
            );
        }

        emailService.sendTicketReply(t.getUserEmail(), t.getUserName(), id, replyBody);
        t.setStatus("IN_PROGRESS");
        ticketRepository.save(t);
    }

    public void delete(Long id) {
        if (!ticketRepository.existsById(id))
            throw new NotFoundException("Ticket not found: " + id);
        ticketRepository.deleteById(id);
    }

    private SupportTicket findOrThrow(Long id) {
        return ticketRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Ticket not found: " + id));
    }
}
