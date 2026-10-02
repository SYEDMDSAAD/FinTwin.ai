package com.fintwin.growth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Who comes to FinTwin and how far they get, for the admin page's Growth tab:
 * landing-page visitors, how the demo is used, and the funnel from visitor to
 * user.
 *
 * Visitors are browsers (an anonymous id each keeps), not people, and the
 * funnel is counts for the period, not individuals followed through it:
 * linking a visitor to the account they later create would mean tracking them.
 */
@Service
public class GrowthService {

    private static final Logger log = LoggerFactory.getLogger(GrowthService.class);
    // The admin's day, not the server's (App Service runs in UTC)
    static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    private final JdbcTemplate jdbc;

    public GrowthService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** One landing-page visit. Never fails loudly: counting must not break the page. */
    public void recordVisit(String visitorId, String source, String device) {
        try {
            jdbc.update("INSERT INTO site_visits (visitor_id, visit_date, first_seen_at, visits, source, device) "
                            + "VALUES (?, ?, ?, 1, ?, ?) "
                            + "ON CONFLICT (visitor_id, visit_date) DO UPDATE SET visits = site_visits.visits + 1",
                    visitorId, LocalDate.now(INDIA), Timestamp.valueOf(LocalDateTime.now()), source, device);
        } catch (Exception e) {
            log.warn("Visit not recorded: {}", e.getClass().getSimpleName());
        }
    }

    public Map<String, Object> summary(int days) {
        LocalDate from = LocalDate.now(INDIA).minusDays(days - 1L);
        // Timestamps are stored in the server's zone; the period starts at midnight in India
        Timestamp since = Timestamp.valueOf(from.atStartOfDay(INDIA)
                .withZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("days", days);
        out.put("from", from.toString());
        out.put("to", LocalDate.now(INDIA).toString());
        out.put("visitors", visitors(from));
        out.put("demo", demo(since));
        out.put("funnel", funnel(from, since));
        return out;
    }

    private Map<String, Object> visitors(LocalDate from) {
        Map<String, Object> v = new LinkedHashMap<>();
        Map<String, Object> totals = jdbc.queryForMap(
                "SELECT COUNT(DISTINCT visitor_id) AS visitors, COALESCE(SUM(visits), 0) AS visits "
                        + "FROM site_visits WHERE visit_date >= ?", from);
        v.put("visitors", ((Number) totals.get("visitors")).longValue());
        v.put("visits", ((Number) totals.get("visits")).longValue());
        v.put("returning", jdbc.queryForObject(
                "SELECT COUNT(*) FROM (SELECT visitor_id FROM site_visits WHERE visit_date >= ? "
                        + "GROUP BY visitor_id HAVING COUNT(*) > 1) r", Long.class, from));
        v.put("daily", jdbc.queryForList(
                "SELECT visit_date::text AS date, COUNT(*) AS visitors, SUM(visits) AS visits "
                        + "FROM site_visits WHERE visit_date >= ? GROUP BY visit_date ORDER BY visit_date", from));
        v.put("sources", jdbc.queryForList(
                "SELECT COALESCE(source, 'direct') AS source, COUNT(DISTINCT visitor_id) AS visitors "
                        + "FROM site_visits WHERE visit_date >= ? GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 8", from));
        v.put("devices", jdbc.queryForList(
                "SELECT COALESCE(device, 'desktop') AS device, COUNT(DISTINCT visitor_id) AS visitors "
                        + "FROM site_visits WHERE visit_date >= ? GROUP BY 1 ORDER BY 2 DESC", from));
        return v;
    }

    private Map<String, Object> demo(Timestamp since) {
        Map<String, Object> d = new LinkedHashMap<>();
        Map<String, Object> s = jdbc.queryForMap(
                "SELECT COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS visitors, "
                        + "COALESCE(AVG(EXTRACT(EPOCH FROM (last_seen_at - started_at)) / 60.0), 0) AS avg_minutes "
                        + "FROM demo_sessions WHERE started_at >= ?", since);
        d.put("sessions", ((Number) s.get("sessions")).longValue());
        d.put("visitors", ((Number) s.get("visitors")).longValue());
        d.put("avgMinutes", Math.round(((Number) s.get("avg_minutes")).doubleValue() * 10) / 10.0);
        d.put("questions", count("question", since));
        d.put("signupClicks", jdbc.queryForObject(
                "SELECT COUNT(DISTINCT session_id) FROM demo_events WHERE kind = 'signup_click' AND at >= ?",
                Long.class, since));
        d.put("daily", jdbc.queryForList(
                "SELECT CAST(started_at AS DATE)::text AS date, COUNT(*) AS sessions FROM demo_sessions "
                        + "WHERE started_at >= ? GROUP BY 1 ORDER BY 1", since));
        d.put("pages", top("page", since, 10));
        d.put("blocked", top("blocked", since, 10));
        d.put("topQuestions", top("question", since, 10));
        d.put("recentQuestions", jdbc.queryForList(
                "SELECT at, detail FROM demo_events WHERE kind = 'question' AND at >= ? ORDER BY at DESC LIMIT 15",
                since));
        return d;
    }

    private Map<String, Object> funnel(LocalDate from, Timestamp since) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("visitors", jdbc.queryForObject(
                "SELECT COUNT(DISTINCT visitor_id) FROM site_visits WHERE visit_date >= ?", Long.class, from));
        f.put("triedDemo", jdbc.queryForObject(
                "SELECT COUNT(DISTINCT COALESCE(visitor_id, id)) FROM demo_sessions WHERE started_at >= ?",
                Long.class, since));
        // Real accounts only: not the demo, not staff
        String realUsers = "FROM users u WHERE u.created_at >= ? "
                + "AND COALESCE(u.role, 'USER') NOT IN ('DEMO', 'ADMIN', 'SUPER_ADMIN')";
        f.put("signedUp", jdbc.queryForObject("SELECT COUNT(*) " + realUsers, Long.class, since));
        f.put("addedData", jdbc.queryForObject("SELECT COUNT(*) " + realUsers
                + " AND EXISTS (SELECT 1 FROM \"transaction\" t WHERE t.user_id = u.id)", Long.class, since));
        return f;
    }

    private long count(String kind, Timestamp since) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM demo_events WHERE kind = ? AND at >= ?",
                Long.class, kind, since);
        return n == null ? 0 : n;
    }

    private List<Map<String, Object>> top(String kind, Timestamp since, int limit) {
        return jdbc.queryForList("SELECT detail, COUNT(*) AS count FROM demo_events "
                + "WHERE kind = ? AND at >= ? AND detail IS NOT NULL GROUP BY detail ORDER BY 2 DESC, 1 LIMIT ?",
                kind, since, limit);
    }
}
