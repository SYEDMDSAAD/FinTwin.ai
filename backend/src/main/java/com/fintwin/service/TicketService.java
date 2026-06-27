package com.fintwin.service;

import com.fintwin.exception.NotFoundException;
import com.fintwin.model.SupportTicket;
import com.fintwin.repository.SupportTicketRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
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
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + id));
    }
}
