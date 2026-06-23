package com.fintwin.service;

import com.fintwin.ai.AIProvider;
import com.fintwin.audit.Audited;
import com.fintwin.dto.FinancialSummaryDTO;
import com.fintwin.model.ChatHistory;
import com.fintwin.model.User;
import com.fintwin.repository.ChatHistoryRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Owns the AI chat lifecycle:
 *   1. Aggregate the user's financial data  (FinancialDataAggregatorService)
 *   2. Call the AI provider                 (AIProvider)
 *   3. Persist and trim the chat history    (ChatHistoryRepository)
 */
@Service
public class ChatService {

    private static final Logger log = LoggerFactory.getLogger(ChatService.class);
    private static final int MAX_HISTORY = 50;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ChatHistoryRepository chatHistoryRepository;

    @Autowired
    private FinancialDataAggregatorService aggregator;

    @Autowired
    private AIProvider aiProvider;

    // ── Chat ─────────────────────────────────────────────────────────────────────

    @Audited(action = "READ", resource = "ai-chat", description = "AI Copilot financial chat session")
    public String chat(String message, String mode) {
        if (message == null || message.isBlank()) {
            return "Please enter a message.";
        }
        try {
            User user = resolveCurrentUser();
            FinancialSummaryDTO summary = aggregator.aggregate(user);
            String reply = aiProvider.chat(message, mode, summary);
            persistExchange(user, message, reply);
            return reply;
        } catch (Exception e) {
            log.error("AI chat failed: {}", e.getMessage());
            return "FinTwin AI is temporarily unavailable.";
        }
    }

    // ── History ───────────────────────────────────────────────────────────────────

    public List<Map<String, String>> getChatHistory() {
        User user = resolveCurrentUser();
        List<ChatHistory> history = chatHistoryRepository.findAllByUserOrderByTimestampAsc(user);
        List<Map<String, String>> result = new ArrayList<>();
        for (ChatHistory chat : history) {
            result.add(Map.of("role", "user",      "content", chat.getMessage()));
            result.add(Map.of("role", "assistant", "content", chat.getReply()));
        }
        return result;
    }

    @Transactional
    public void clearChatHistory() {
        chatHistoryRepository.deleteByUser(resolveCurrentUser());
    }

    // ── Internal helpers ─────────────────────────────────────────────────────────

    private User resolveCurrentUser() {
        return userRepository.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    private void persistExchange(User user, String message, String reply) {
        ChatHistory chat = new ChatHistory();
        chat.setRole("user");
        chat.setMessage(message);
        chat.setReply(reply);
        chat.setTimestamp(LocalDateTime.now());
        chat.setUser(user);
        chatHistoryRepository.save(chat);

        long count = chatHistoryRepository.countByUser(user);
        if (count > MAX_HISTORY) {
            List<ChatHistory> all = chatHistoryRepository.findAllByUserOrderByTimestampAsc(user);
            List<Long> toDelete = all.subList(0, (int) (count - MAX_HISTORY))
                    .stream().map(ChatHistory::getId).collect(Collectors.toList());
            chatHistoryRepository.deleteAllById(toDelete);
        }
    }
}
