package com.fintwin.controller;

import com.fintwin.security.AiToolToken;
import com.fintwin.service.SpendGuardLinks;
import com.fintwin.util.Categorized;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;

/**
 * Spend Guard's side of the internal API: guard-service keeps its records here
 * and asks FinTwin's categoriser about a payee; the Copilot reads Spend Guard's
 * monthly figures. Same access rule as {@link InternalAIController}: the
 * internal key plus a tool token minted by the backend for that one user.
 */
@RestController
@RequestMapping("/internal/ai")
public class InternalGuardController {

    private static final Logger log = LoggerFactory.getLogger(InternalGuardController.class);

    @Value("${ai.service.internal-key}")
    private String internalKey;

    private final SpendGuardLinks links;
    private final AiToolToken toolTokens;

    public InternalGuardController(SpendGuardLinks links, AiToolToken toolTokens) {
        this.links = links;
        this.toolTokens = toolTokens;
    }

    /** FinTwin's category for a scanned payee, the user's own corrections first. */
    @GetMapping("/{userId}/categorize")
    public ResponseEntity<?> categorize(@RequestHeader(value = "X-Internal-Key", required = false) String key,
                                        @RequestHeader(value = "X-Tool-Token", required = false) String toolToken,
                                        @PathVariable Long userId,
                                        @RequestParam(defaultValue = "") String name) {
        ResponseEntity<?> denied = requireAccess(key, toolToken, userId);
        if (denied != null) return denied;
        Categorized c = links.categorize(userId, name);
        return ResponseEntity.ok(Map.of("category", c.category(), "source", c.source()));
    }

    @GetMapping("/{userId}/guard-state")
    public ResponseEntity<?> loadState(@RequestHeader(value = "X-Internal-Key", required = false) String key,
                                       @RequestHeader(value = "X-Tool-Token", required = false) String toolToken,
                                       @PathVariable Long userId) {
        ResponseEntity<?> denied = requireAccess(key, toolToken, userId);
        if (denied != null) return denied;
        Map<String, Object> out = new HashMap<>();
        out.put("state", links.loadState(userId).orElse(null));
        return ResponseEntity.ok(out);
    }

    @PutMapping("/{userId}/guard-state")
    public ResponseEntity<?> saveState(@RequestHeader(value = "X-Internal-Key", required = false) String key,
                                       @RequestHeader(value = "X-Tool-Token", required = false) String toolToken,
                                       @PathVariable Long userId,
                                       @RequestBody Map<String, Object> body) {
        ResponseEntity<?> denied = requireAccess(key, toolToken, userId);
        if (denied != null) return denied;
        Object state = body.get("state");
        Object summary = body.get("summary");
        boolean ok = state instanceof String s
                && links.saveState(userId, s, summary instanceof String t ? t : null);
        return ok ? ResponseEntity.ok(Map.of("saved", true))
                  : ResponseEntity.badRequest().body(Map.of("error", "Spend Guard's records weren't valid."));
    }

    /** This month's Spend Guard figures, for the Copilot's get_spend_guard tool. */
    @GetMapping("/{userId}/spend-guard")
    public ResponseEntity<?> summary(@RequestHeader(value = "X-Internal-Key", required = false) String key,
                                     @RequestHeader(value = "X-Tool-Token", required = false) String toolToken,
                                     @PathVariable Long userId) {
        ResponseEntity<?> denied = requireAccess(key, toolToken, userId);
        if (denied != null) return denied;
        return ResponseEntity.ok(links.summary(userId));
    }

    private ResponseEntity<?> requireAccess(String key, String toolToken, Long userId) {
        if (internalKey == null || internalKey.isBlank() || key == null
                || !MessageDigest.isEqual(internalKey.getBytes(StandardCharsets.UTF_8),
                                          key.getBytes(StandardCharsets.UTF_8))) {
            log.warn("Internal guard API called with missing/invalid key");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Invalid internal key"));
        }
        if (!toolTokens.allows(toolToken, userId)) {
            log.warn("Internal guard API called without a valid tool token for the requested user");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Invalid or expired tool token"));
        }
        return null;
    }
}
