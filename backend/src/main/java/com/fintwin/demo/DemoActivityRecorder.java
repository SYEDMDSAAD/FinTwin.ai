package com.fintwin.demo;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDateTime;

/**
 * Records how the demo is used, for the admin page: sessions started, pages
 * opened, copilot questions, actions turned away, sign-up clicks.
 *
 * Usage stats must never break the demo itself, so every method swallows its
 * own failures.
 */
@Service
public class DemoActivityRecorder {

    private static final Logger log = LoggerFactory.getLogger(DemoActivityRecorder.class);
    static final int DETAIL_MAX = 300;

    private final JdbcTemplate jdbc;

    public DemoActivityRecorder(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void sessionStarted(String sessionId, String visitorId, String device, String source) {
        try {
            LocalDateTime now = LocalDateTime.now();
            jdbc.update("INSERT INTO demo_sessions (id, visitor_id, started_at, last_seen_at, device, source) "
                            + "VALUES (?, ?, ?, ?, ?, ?)",
                    sessionId, clip(visitorId, 40), Timestamp.valueOf(now), Timestamp.valueOf(now),
                    clip(device, 10), clip(source, 60));
        } catch (Exception e) {
            log.warn("Demo session not recorded: {}", e.getClass().getSimpleName());
        }
    }

    /** kind: page | question | signup_click */
    public void event(String sessionId, String kind, String detail) {
        if (sessionId == null) return;
        try {
            LocalDateTime now = LocalDateTime.now();
            jdbc.update("INSERT INTO demo_events (session_id, at, kind, detail) VALUES (?, ?, ?, ?)",
                    sessionId, Timestamp.valueOf(now), kind, clip(detail, DETAIL_MAX));
            jdbc.update("UPDATE demo_sessions SET last_seen_at = ? WHERE id = ?",
                    Timestamp.valueOf(now), sessionId);
        } catch (Exception e) {
            log.warn("Demo event not recorded: {}", e.getClass().getSimpleName());
        }
    }

    /** A write the read-only demo turned away: shows what visitors wanted to try. */
    public void blocked(HttpServletRequest request, String action) {
        Object sid = request.getAttribute(DemoSession.REQUEST_ATTR);
        event(sid instanceof String s ? s : null, "blocked", action);
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        String t = s.strip();
        return t.length() <= max ? t : t.substring(0, max);
    }
}
