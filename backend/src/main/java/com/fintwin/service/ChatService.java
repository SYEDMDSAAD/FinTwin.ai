package com.fintwin.service;

import com.fintwin.ai.AIProvider;
import com.fintwin.audit.Audited;
import com.fintwin.exception.NotFoundException;
import com.fintwin.config.FinTwinMetrics;
import com.fintwin.dto.FinancialSummaryDTO;
import com.fintwin.model.ChatHistory;
import com.fintwin.model.User;
import com.fintwin.repository.ChatHistoryRepository;
import com.fintwin.repository.CopilotFeedbackRepository;
import com.fintwin.model.CopilotFeedback;
import com.fintwin.exception.BadRequestException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
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

    @Autowired
    private FinTwinMetrics metrics;

    @Autowired
    private CopilotFeedbackRepository feedbackRepository;

    @Autowired
    private ObjectMapper objectMapper;

    /** Why an answer wasn't helpful — a fixed list, so they can be counted. */
    public static final Set<String> RATING_REASONS =
            Set.of("WRONG_NUMBERS", "DIDNT_ANSWER", "NOT_USEFUL", "TOO_LONG", "OTHER");

    // ── Chat ─────────────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    @Audited(action = "READ", resource = "ai-chat", description = "AI Copilot financial chat session")
    public Map<String, Object> chat(String message, String mode) {
        if (message == null || message.isBlank()) {
            return Map.of("reply", "Please enter a message.");
        }
        metrics.aiChatCalls.increment();
        User user = resolveCurrentUser();
        FinancialSummaryDTO summary = aggregator.aggregate(user);
        AIProvider.ChatResult result = callAiProvider(message, mode, summary);
        String reply = result.reply();
        ChatHistory saved = persistExchange(user, message, reply, traceJson(result.trace(), mode));
        // exchangeId lets the client delete this exchange without a reload.
        return saved != null
                ? Map.of("reply", reply, "exchangeId", saved.getId())
                : Map.of("reply", reply);
    }

    @CircuitBreaker(name = "ai-service", fallbackMethod = "chatFallback")
    AIProvider.ChatResult callAiProvider(String message, String mode, FinancialSummaryDTO summary) {
        return aiProvider.chatWithTrace(message, mode, summary);
    }

    @SuppressWarnings("unused")
    AIProvider.ChatResult chatFallback(String message, String mode, FinancialSummaryDTO summary, Exception ex) {
        log.warn("AI chat circuit open ({}), returning fallback", ex.getMessage());
        return new AIProvider.ChatResult("FinTwin AI is temporarily unavailable. Please try again in a moment.",
                Map.of("path", "unavailable", "error", ex.getClass().getSimpleName()));
    }

    // ── History ───────────────────────────────────────────────────────────────────

    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    public List<Map<String, Object>> getChatHistory() {
        User user = resolveCurrentUser();
        List<ChatHistory> history = chatHistoryRepository.findAllByUserOrderByTimestampAsc(user);
        List<Map<String, Object>> result = new ArrayList<>();
        for (ChatHistory chat : history) {
            String id = String.valueOf(chat.getId());
            result.add(Map.of("role", "user", "content", chat.getMessage(), "exchangeId", id));
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("role", "assistant");
            answer.put("content", chat.getReply());
            answer.put("exchangeId", id);
            if (chat.getRating() != null) answer.put("rating", chat.getRating());
            result.add(answer);
        }
        return result;
    }

    /**
     * The user's verdict on one answer: 1 helpful, -1 not (with a reason from
     * {@link #RATING_REASONS}), 0 to take it back. A rated exchange is copied
     * to copilot_feedback, which outlives the 50-exchange history trim.
     */
    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    @Transactional
    public Map<String, Object> rate(Long id, int rating, String reason) {
        if (rating < -1 || rating > 1) throw new BadRequestException("Rating must be 1, -1 or 0");
        if (reason != null && !reason.isBlank() && !RATING_REASONS.contains(reason))
            throw new BadRequestException("Unknown reason");
        String why = rating < 0 && reason != null && !reason.isBlank() ? reason : null;

        User user = resolveCurrentUser();
        ChatHistory chat = chatHistoryRepository.findById(id)
                .filter(c -> c.getUser() != null && c.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new NotFoundException("Chat message not found"));

        if (rating == 0) {
            chat.setRating(null);
            chat.setRatingReason(null);
            chatHistoryRepository.save(chat);
            feedbackRepository.deleteByUserAndExchangeId(user, id);
            return Map.of("exchangeId", id);
        }

        chat.setRating((short) rating);
        chat.setRatingReason(why);
        chatHistoryRepository.save(chat);

        CopilotFeedback f = feedbackRepository.findByUserAndExchangeId(user, id).orElseGet(CopilotFeedback::new);
        f.setUser(user);
        f.setExchangeId(id);
        f.setQuestion(chat.getMessage());
        f.setAnswer(chat.getReply());
        f.setRating((short) rating);
        f.setReason(why);
        f.setTrace(chat.getTrace());
        f.setPath(pathOf(chat.getTrace()));
        f.setMode(modeOf(chat.getTrace()));
        f.setCreatedAt(LocalDateTime.now());
        feedbackRepository.save(f);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exchangeId", id);
        out.put("rating", rating);
        if (why != null) out.put("reason", why);
        return out;
    }

    /**
     * Admin: how rated answers split by the path that produced them, the
     * reasons given for unhelpful ones, and the latest unhelpful answers from
     * users who opted in to their use for improving the AI.
     */
    public Map<String, Object> feedbackStats() {
        return feedbackStats(feedbackRepository.countByPathRatingReason(),
                feedbackRepository.findConsentedDownvotes(org.springframework.data.domain.PageRequest.of(0, 20)));
    }

    static Map<String, Object> feedbackStats(List<Object[]> rows, List<CopilotFeedback> recent) {
        Map<String, long[]> byPath = new TreeMap<>();           // path → [helpful, unhelpful]
        Map<String, Long> reasons = new TreeMap<>();
        long up = 0, down = 0;
        for (Object[] r : rows) {
            String path = r[0] == null ? "unknown" : (String) r[0];
            int rating = ((Number) r[1]).intValue();
            long n = ((Number) r[3]).longValue();
            long[] c = byPath.computeIfAbsent(path, k -> new long[2]);
            if (rating > 0) { c[0] += n; up += n; }
            else { c[1] += n; down += n; reasons.merge(r[2] == null ? "NO_REASON" : (String) r[2], n, Long::sum); }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rated", up + down);
        out.put("helpful", up);
        out.put("notHelpful", down);
        out.put("helpfulRate", up + down == 0 ? null : Math.round(up * 1000.0 / (up + down)) / 10.0);
        out.put("byPath", byPath.entrySet().stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            long[] c = e.getValue();
            m.put("path", e.getKey());
            m.put("helpful", c[0]);
            m.put("notHelpful", c[1]);
            m.put("helpfulRate", Math.round(c[0] * 1000.0 / (c[0] + c[1])) / 10.0);
            return m;
        }).toList());
        out.put("reasons", reasons);
        out.put("recentNotHelpful", recent.stream().map(f -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("question", f.getQuestion());
            m.put("answer", f.getAnswer());
            m.put("reason", f.getReason());
            m.put("path", f.getPath());
            m.put("trace", f.getTrace());
            m.put("at", f.getCreatedAt());
            return m;
        }).toList());
        return out;
    }

    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    @Transactional
    public void clearChatHistory() {
        User user = resolveCurrentUser();
        chatHistoryRepository.deleteByUser(user);
        // Clearing the chat also withdraws the answers the user rated
        feedbackRepository.deleteByUser(user);
    }

    // Deletes one exchange (user message + AI reply). Ownership is enforced:
    // the row must belong to the calling user.
    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    @Transactional
    public void deleteChatMessage(Long id) {
        User user = resolveCurrentUser();
        ChatHistory chat = chatHistoryRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Chat message not found"));
        if (chat.getUser() == null || !chat.getUser().getId().equals(user.getId())) {
            throw new NotFoundException("Chat message not found");
        }
        chatHistoryRepository.delete(chat);
        feedbackRepository.deleteByUserAndExchangeId(user, id);
    }

    // ── Internal helpers ─────────────────────────────────────────────────────────

    private User resolveCurrentUser() {
        return userRepository.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
    }

    /** The trace as stored: JSON, with the mode added, capped so one odd answer can't bloat the row. */
    private String traceJson(Map<String, Object> trace, String mode) {
        Map<String, Object> t = new LinkedHashMap<>(trace == null ? Map.of() : trace);
        if (mode != null) t.put("mode", mode);
        try {
            String json = objectMapper.writeValueAsString(t);
            return json.length() > 8000 ? json.substring(0, 8000) : json;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private String pathOf(String traceJson) {
        return field(traceJson, "path", 30);
    }

    private String modeOf(String traceJson) {
        return field(traceJson, "mode", 64);
    }

    private String field(String traceJson, String name, int max) {
        if (traceJson == null) return null;
        try {
            Object v = objectMapper.readValue(traceJson, Map.class).get(name);
            if (v == null) return null;
            String s = v.toString();
            return s.length() > max ? s.substring(0, max) : s;
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    private ChatHistory persistExchange(User user, String message, String reply, String trace) {
        ChatHistory chat = new ChatHistory();
        chat.setTrace(trace);
        chat.setRole("user");
        chat.setMessage(message);
        chat.setReply(reply);
        chat.setTimestamp(LocalDateTime.now());
        chat.setUser(user);
        ChatHistory saved = chatHistoryRepository.save(chat);

        long count = chatHistoryRepository.countByUser(user);
        if (count > MAX_HISTORY) {
            List<ChatHistory> all = chatHistoryRepository.findAllByUserOrderByTimestampAsc(user);
            List<Long> toDelete = all.subList(0, (int) (count - MAX_HISTORY))
                    .stream().map(ChatHistory::getId).collect(Collectors.toList());
            chatHistoryRepository.deleteAllById(toDelete);
        }
        return saved;
    }
}
