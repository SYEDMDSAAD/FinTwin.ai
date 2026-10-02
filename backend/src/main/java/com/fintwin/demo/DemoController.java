package com.fintwin.demo;

import com.fintwin.model.User;
import com.fintwin.security.JwtUtil;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * "Try the demo": one click, no sign-up, into the shared demo account.
 */
@RestController
@RequestMapping("/api/v1/demo")
public class DemoController {

    private static final Pattern VISITOR_ID = Pattern.compile("[A-Za-z0-9-]{8,40}");
    private static final Pattern HOST = Pattern.compile("[a-z0-9.-]{1,60}");
    // What the app may report about a demo visit
    private static final Set<String> EVENT_KINDS = Set.of("page", "signup_click");

    private final DemoAccountService demo;
    private final DemoActivityRecorder activity;
    private final JwtUtil jwt;
    private final long sessionMillis;

    public DemoController(DemoAccountService demo, DemoActivityRecorder activity, JwtUtil jwt,
                          @Value("${demo.session-minutes:120}") long sessionMinutes) {
        this.demo = demo;
        this.activity = activity;
        this.jwt = jwt;
        this.sessionMillis = sessionMinutes * 60_000;
    }

    /**
     * Public. Starts a demo session and returns its token. Each click is a new
     * session: that's what keeps visitors' copilot chats apart and counts visits.
     */
    @PostMapping("/start")
    public ResponseEntity<Map<String, Object>> start(@RequestBody(required = false) Map<String, Object> body,
                                                     HttpServletRequest request) {
        if (!demo.isEnabled()) return ResponseEntity.notFound().build();
        Map<String, Object> in = body == null ? Map.of() : body;
        User user = demo.demoUser();
        String sessionId = UUID.randomUUID().toString();
        activity.sessionStarted(sessionId, clean(in.get("visitorId"), VISITOR_ID, false),
                device(request.getHeader("User-Agent")), clean(in.get("source"), HOST, true));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("accessToken", jwt.generateDemoToken(user.getEmail(), sessionId, sessionMillis));
        out.put("email", user.getEmail());
        out.put("fullName", user.getFullName());
        out.put("role", DemoSession.ROLE);
        out.put("expiresInSeconds", sessionMillis / 1000);
        return ResponseEntity.ok(out);
    }

    /** A page the demo visitor opened, or their click on "Sign up". Demo sessions only. */
    @PostMapping("/event")
    public ResponseEntity<Void> event(@RequestBody Map<String, Object> body) {
        String session = DemoSession.current().orElse(null);
        Object kind = body.get("kind");
        if (session == null || !(kind instanceof String k) || !EVENT_KINDS.contains(k)) {
            return ResponseEntity.badRequest().build();
        }
        Object detail = body.get("detail");
        activity.event(session, k, detail instanceof String d ? d : null);
        return ResponseEntity.noContent().build();
    }

    static String device(String userAgent) {
        return userAgent != null && userAgent.contains("Mobi") ? "mobile" : "desktop";
    }

    /** Only well-formed values are kept: these come straight from the browser. */
    private static String clean(Object value, Pattern allowed, boolean lowercase) {
        if (!(value instanceof String s)) return null;
        String v = lowercase ? s.strip().toLowerCase() : s.strip();
        return allowed.matcher(v).matches() ? v : null;
    }
}
