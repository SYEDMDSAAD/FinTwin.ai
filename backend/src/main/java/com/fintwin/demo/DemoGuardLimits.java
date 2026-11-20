package com.fintwin.demo;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * How much of Spend Guard the shared demo may use. The demo account is exempt
 * from the per-user AI allowance (one visitor would use up everyone's), so
 * Spend Guard's model calls get their own caps here: per visit and per day,
 * like the copilot's DemoLimits. Counted in memory; a restart starts afresh.
 */
@Component
public class DemoGuardLimits {

    /** The calls that can reach the model. Reading the wallet and choosing an outcome are free. */
    static final Set<String> AI_ACTIONS = Set.of("check", "topup", "rebalance", "payday");
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final int perVisit;
    private final int perDay;
    private final Map<String, Integer> visits = new HashMap<>();
    private int today;
    private LocalDate day = LocalDate.now(IST);

    public DemoGuardLimits(@Value("${demo.guard-checks-per-visit:25}") int perVisit,
                           @Value("${demo.guard-checks-per-day:500}") int perDay) {
        this.perVisit = perVisit;
        this.perDay = perDay;
    }

    /** Counts this call and returns null, or says why the demo can't make it. */
    public synchronized String take(String visit, String action) {
        if (!AI_ACTIONS.contains(action)) return null;
        LocalDate now = LocalDate.now(IST);
        if (!now.equals(day)) {
            day = now;
            today = 0;
            visits.clear();
        }
        if (today >= perDay) {
            return "The demo's Spend Guard checks for today are used up. They reset at midnight; "
                    + "sign up to use Spend Guard with your own account.";
        }
        int used = visits.getOrDefault(visit, 0);
        if (used >= perVisit) {
            return "That's the " + perVisit + " Spend Guard checks this demo allows. "
                    + "Sign up to keep going with your own account.";
        }
        visits.put(visit, used + 1);
        today++;
        return null;
    }
}
