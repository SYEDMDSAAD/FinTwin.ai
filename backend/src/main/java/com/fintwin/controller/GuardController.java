package com.fintwin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.ai.AiQuotaExceededException;
import com.fintwin.exception.UnauthorizedException;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.AiToolToken;
import com.fintwin.security.SecurityUtils;
import com.fintwin.service.SpendGuardLinks;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Spend Guard (prototype): the AI checks a payment or a top-up before the user
 * pays. This controller is a thin, locked-down proxy to guard-service on
 * Cloud Run, which runs the agents.
 *
 * <ul>
 *   <li>Only holders of USE_SPEND_GUARD (not the shared DEMO account) and, while
 *       this is a prototype, only the user ids in {@code guard.allowed-users}.</li>
 *   <li>Only the actions in {@link #ACTIONS}: the path is never passed through.</li>
 *   <li>The user id and a fresh tool token are set here, overwriting anything the
 *       browser sent, so a user can only ever act on their own data. The token is
 *       what lets guard-service read this user's budgets and goals from
 *       /internal/ai; it can pass tokens back but can't make them.</li>
 *   <li>FinTwin never moves money: guard-service only returns UPI links that the
 *       user opens in their own UPI app and approves with their own PIN.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/v1/guard")
@PreAuthorize("hasAuthority('USE_SPEND_GUARD')")
public class GuardController {

    private static final Logger log = LoggerFactory.getLogger(GuardController.class);

    /** Everything guard-service does for a user. Anything else is a 404 here. */
    static final Set<String> ACTIONS = Set.of(
            "hello", "wallet", "check", "outcome", "topup", "rebalance", "approve-cuts",
            "payday", "approve-plan", "regret", "wishlist-remove", "settings", "demo-reset");

    static final String NOT_SET_UP = "Spend Guard isn't set up on this server yet.";
    static final String NOT_OPEN = "Spend Guard is a prototype and isn't open for this account yet.";
    static final String QUOTA = "You've reached today's FinTwin AI limit. It resets at midnight, "
            + "and everything else in FinTwin keeps working as usual.";
    static final String OFFLINE = "Spend Guard can't be reached right now. Try again in a moment.";
    static final String SLOW = "Spend Guard took too long to answer. Try again.";

    private final RestTemplate guard;
    private final AiToolToken toolTokens;
    private final UserRepository users;
    private final String guardUrl;
    private final Set<Long> allowedUsers;
    private final ObjectMapper mapper = new ObjectMapper();
    private final SpendGuardLinks links;      // null in unit tests that don't need it

    public GuardController(RestTemplate guard, AiToolToken toolTokens, UserRepository users,
                           String guardUrl, String allowedUsers) {
        this(guard, toolTokens, users, guardUrl, allowedUsers, null);
    }

    @Autowired
    public GuardController(@Qualifier("guardRestTemplate") RestTemplate guard,
                           AiToolToken toolTokens,
                           UserRepository users,
                           @Value("${guard.service.url:}") String guardUrl,
                           @Value("${guard.allowed-users:}") String allowedUsers,
                           SpendGuardLinks links) {
        this.links = links;
        this.guard = guard;
        this.toolTokens = toolTokens;
        this.users = users;
        this.guardUrl = guardUrl == null ? "" : guardUrl.trim().replaceAll("/+$", "");
        this.allowedUsers = parseIds(allowedUsers);
    }

    /** Whether to show Spend Guard to this user at all. */
    @GetMapping("/enabled")
    public Map<String, Object> enabled() {
        return Map.of("enabled", !guardUrl.isEmpty() && allowedUsers.contains(currentUserId()));
    }

    /** "I didn't pay": takes back the transaction Spend Guard recorded for a payment. */
    @PostMapping("/unrecord")
    public ResponseEntity<Map<String, Object>> unrecord(@RequestBody(required = false) Map<String, Object> body) {
        Long userId = currentUserId();
        if (!allowedUsers.contains(userId)) {
            return error(403, NOT_OPEN);
        }
        Object eventId = body == null ? null : body.get("eventId");
        boolean removed = links != null && eventId != null && links.unrecordPayment(userId, eventId.toString());
        return ResponseEntity.ok(Map.of("removed", removed));
    }

    @PostMapping("/{action}")
    public ResponseEntity<Map<String, Object>> call(@PathVariable String action,
                                                    @RequestBody(required = false) Map<String, Object> body) {
        if (!ACTIONS.contains(action)) {
            return ResponseEntity.notFound().build();
        }
        Long userId = currentUserId();
        if (guardUrl.isEmpty()) {
            return error(503, NOT_SET_UP);
        }
        if (!allowedUsers.contains(userId)) {
            return error(403, NOT_OPEN);
        }

        Map<String, Object> payload = new HashMap<>(body == null ? Map.of() : body);
        payload.put("userId", userId);                       // never the browser's
        payload.put("toolToken", toolTokens.mint(userId));

        try {
            @SuppressWarnings("unchecked")
            ResponseEntity<Map<String, Object>> resp = (ResponseEntity<Map<String, Object>>) (ResponseEntity<?>)
                    guard.postForEntity(guardUrl + "/guard/" + action, payload, Map.class);
            return ResponseEntity.status(resp.getStatusCode()).body(linkToFinTwin(action, userId, resp.getBody()));
        } catch (AiQuotaExceededException e) {
            return error(429, QUOTA);
        } catch (HttpStatusCodeException e) {
            // guard-service turned the request down (a bad QR code, an unknown event):
            // pass its status and message on, never its raw body
            return error(e.getStatusCode().value(), messageFrom(e.getResponseBodyAsString()));
        } catch (RestClientException e) {
            log.warn("Spend Guard call '{}' failed: {}", action, e.getClass().getSimpleName());
            return isTimeout(e) ? error(504, SLOW) : error(503, OFFLINE);
        }
    }

    /**
     * guard-service proposes what should reach the rest of FinTwin; this checks
     * and writes it for the signed-in user, then tells the page what happened.
     * A paid payment ("record") becomes a transaction; an approved salary plan
     * ("goalPlan") earmarks goal money. A failure here never fails the decision.
     */
    Map<String, Object> linkToFinTwin(String action, Long userId, Map<String, Object> body) {
        if (body == null) return null;
        Map<String, Object> out = new LinkedHashMap<>(body);
        Object record = out.remove("record");
        Object goalPlan = out.remove("goalPlan");
        if (links == null) return out;
        try {
            if ("outcome".equals(action) && record instanceof Map<?, ?> r) {
                out.put("recordedTransactionId", links.recordPayment(userId, r));
            }
            if ("approve-plan".equals(action) && goalPlan instanceof Map<?, ?> g) {
                out.put("goalsEarmarked", links.earmarkGoals(userId, g));
            }
        } catch (RuntimeException e) {
            log.warn("Spend Guard couldn't update FinTwin after '{}': {}", action, e.getClass().getSimpleName());
        }
        return out;
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Long currentUserId() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .map(User::getId)
                .orElseThrow(() -> new UnauthorizedException("User not found"));
    }

    static Set<Long> parseIds(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> s.matches("\\d{1,18}"))
                .map(Long::valueOf)
                .collect(Collectors.toUnmodifiableSet());
    }

    /** FastAPI errors look like {"detail": "..."}; anything else gets a plain message. */
    String messageFrom(String body) {
        try {
            Object detail = mapper.readValue(body, Map.class).get("detail");
            if (detail instanceof String s && !s.isBlank() && s.length() <= 300) return s;
        } catch (Exception ignored) {
            // not JSON: fall through
        }
        return "Spend Guard couldn't do that.";
    }

    private static ResponseEntity<Map<String, Object>> error(int status, String message) {
        return ResponseEntity.status(status).body(Map.of("error", message));
    }

    private static boolean isTimeout(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t instanceof java.net.SocketTimeoutException) return true;
        }
        return false;
    }
}
