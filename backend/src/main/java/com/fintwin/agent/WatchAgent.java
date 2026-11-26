package com.fintwin.agent;

import com.fintwin.dto.AnomalyDTO;
import com.fintwin.model.AgentAlert;
import com.fintwin.model.User;
import com.fintwin.repository.AgentAlertRepository;
import com.fintwin.service.AnomalyService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

/**
 * After an import, runs the anomaly checks and raises a bell alert for each
 * high-severity one it hasn't raised before. Medium and low ones stay on the
 * Insights page only, so the bell isn't noisy. Dismissing the anomaly there
 * also hides its alert.
 */
@Component
public class WatchAgent {

    private static final Logger log = LoggerFactory.getLogger(WatchAgent.class);

    /** New alerts per import, at most: a first statement can surface many old ones. */
    static final int MAX_NEW = 3;

    private final AnomalyService anomalies;
    private final AgentAlertRepository alerts;
    private final TransactionTemplate writes;

    public WatchAgent(AnomalyService anomalies, AgentAlertRepository alerts, PlatformTransactionManager txManager) {
        this.anomalies = anomalies;
        this.alerts = alerts;
        this.writes = new TransactionTemplate(txManager);
        this.writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Number of new alerts raised. Never throws. */
    public int run(User user) {
        try {
            Integer n = writes.execute(s -> raise(user));
            int raised = n == null ? 0 : n;
            if (raised > 0) log.info("Watch agent: {} new alert(s) for user #{}", raised, user.getId());
            return raised;
        } catch (RuntimeException e) {
            log.warn("Watch agent failed for user #{}: {}", user.getId(), e.getClass().getSimpleName());
            return 0;
        }
    }

    private int raise(User user) {
        int raised = 0;
        List<AnomalyDTO> found = anomalies.detectFor(user);
        for (AnomalyDTO a : found) {
            if (raised >= MAX_NEW) break;
            if (!"high".equals(a.getSeverity())) continue;
            String key = key(user, a);
            if (alerts.existsByUserAndPatternKey(user, key)) continue;
            AgentAlert alert = new AgentAlert();
            alert.setUser(user);
            alert.setAgent(AgentAlert.WATCH);
            alert.setPatternKey(key);
            alert.setSeverity(a.getSeverity());
            alert.setAnomalyType(a.getType());
            alert.setMerchant(a.getMerchant());
            alert.setMessage(message(a));
            alerts.save(alert);
            raised++;
        }
        return raised;
    }

    /** Same anomaly, same key — so the same payment is flagged once, however often it's re-imported. */
    static String key(User user, AnomalyDTO a) {
        String raw = user.getId() + "|" + a.getType() + "|" + (a.getMerchant() == null ? "" : a.getMerchant().trim().toLowerCase())
                + "|" + (a.getAmount() == null ? "" : Math.round(a.getAmount()));
        try {
            return "watch-" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8))).substring(0, 52);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String message(AnomalyDTO a) {
        long amount = a.getAmount() == null ? 0 : Math.round(a.getAmount());
        String amt = "₹" + String.format("%,d", amount);
        return switch (a.getType() == null ? "" : a.getType()) {
            case "merchant_spike" -> "Unusual payment: " + amt + " to " + a.getMerchant() + ", about "
                    + a.getMultiplier() + "x what you usually pay there. Check it's yours.";
            case "large_transaction" -> "Large payment: " + amt + " to " + a.getMerchant()
                    + ", much bigger than your usual payments. Check it's yours.";
            case "category_spike" -> a.getCategory() + " spending is " + a.getMultiplier()
                    + "x your usual this month (" + amt + " so far).";
            case "burst" -> "Lots of payments in one day: " + amt + " in total on "
                    + a.getMerchant().replace("Spending Burst — ", "") + ". Check they're all yours.";
            default -> "Something unusual in your spending: " + amt + ". Have a look under Insights.";
        };
    }
}
