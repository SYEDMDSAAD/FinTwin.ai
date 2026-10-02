package com.fintwin.demo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.LocalDate;

/**
 * How much of the copilot the demo may use. Everyone shares one account, so
 * the per-user daily token cap doesn't fit: one visitor would use up
 * everyone's. Instead each visit gets a number of questions, and the demo as
 * a whole a daily ceiling, which protects the machine the model runs on.
 */
@Component
public class DemoLimits {

    private final JdbcTemplate jdbc;
    private final int perSession;
    private final int perDay;

    public DemoLimits(JdbcTemplate jdbc,
                      @Value("${demo.questions-per-session:15}") int perSession,
                      @Value("${demo.questions-per-day:400}") int perDay) {
        this.jdbc = jdbc;
        this.perSession = perSession;
        this.perDay = perDay;
    }

    /** Throws {@link DemoLimitException} when this visit, or the demo today, has asked enough. */
    public void checkQuestion(String sessionId, long askedThisSession) {
        if (askedThisSession >= perSession) {
            throw new DemoLimitException("That's the " + perSession + " questions this demo allows. "
                    + "Sign up (it's free) to keep asking about your own money.");
        }
        Long today = jdbc.queryForObject(
                "SELECT COUNT(*) FROM demo_events WHERE kind = 'question' AND at >= ?", Long.class,
                Timestamp.valueOf(LocalDate.now(DemoAccountService.INDIA).atStartOfDay()));
        if (today != null && today >= perDay) {
            throw new DemoLimitException("The demo copilot has had a busy day and is resting until tomorrow. "
                    + "Sign up (it's free) to ask about your own money now.");
        }
    }
}
