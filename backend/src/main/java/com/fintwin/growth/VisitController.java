package com.fintwin.growth;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.regex.Pattern;

/**
 * Public: the landing page reports a visit. Anyone can call it, so it takes
 * only well-formed values, ignores obvious bots, and is rate-limited per IP
 * (RateLimitFilter); the worst a caller can do is add a few visits.
 */
@RestController
@RequestMapping("/api/v1/visits")
public class VisitController {

    static final Pattern VISITOR_ID = Pattern.compile("[A-Za-z0-9-]{8,40}");
    static final Pattern HOST = Pattern.compile("[a-z0-9.-]{1,60}");
    // Crawlers, link previews and uptime checks aren't visitors
    static final Pattern BOT = Pattern.compile(
            "(?i)bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|"
                    + "monitor|curl|wget|python-requests|httpclient|java/");

    private final GrowthService growth;

    public VisitController(GrowthService growth) {
        this.growth = growth;
    }

    @PostMapping
    public ResponseEntity<Void> visit(@RequestBody(required = false) Map<String, Object> body,
                                      HttpServletRequest request) {
        String agent = request.getHeader("User-Agent");
        Object id = body == null ? null : body.get("visitorId");
        if (agent == null || BOT.matcher(agent).find()
                || !(id instanceof String visitor) || !VISITOR_ID.matcher(visitor).matches()) {
            return ResponseEntity.noContent().build();         // ignored, quietly
        }
        Object src = body.get("source");
        String source = src instanceof String s && HOST.matcher(s.strip().toLowerCase()).matches()
                ? s.strip().toLowerCase() : null;
        growth.recordVisit(visitor, source, agent.contains("Mobi") ? "mobile" : "desktop");
        return ResponseEntity.noContent().build();
    }
}
