package com.fintwin.service;

import com.fintwin.dto.SpendingCoachResponseDTO;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import com.fintwin.config.FinTwinMetrics;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;

@Service
public class SpendingCoachService {

    private static final Logger log =
            LoggerFactory.getLogger(SpendingCoachService.class);

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private UserRepository userRepository;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    @Autowired
    private FinTwinMetrics metrics;

    // A coach run costs a 10-20s LLM generation, and its input is fully
    // determined by the transaction window — so identical windows are served
    // the previous answer instead of re-generated. Keyed on a digest of the
    // window itself (not the user alone): the moment a transaction is added,
    // edited or re-synced, the key changes and the entry is simply never hit
    // again. The TTL exists for the one input the digest cannot see — the
    // analysis excludes the *current* month as incomplete, so a result must
    // not outlive the day it was computed on. Only real AI responses are
    // cached: caching the statistical fallback would pin an outage's output
    // for hours after the AI service recovered.
    private final Cache<String, SpendingCoachResponseDTO> coachCache =
            Caffeine.newBuilder()
                    .expireAfterWrite(Duration.ofHours(6))
                    .maximumSize(2_000)
                    .build();

    @PreAuthorize("hasAuthority('USE_AI_SPENDING_COACH')")
    public SpendingCoachResponseDTO
    getCoachInsights() {

        String email =
                SecurityUtils.getCurrentUserEmail();

        User user =
                userRepository
                        .findByEmail(email)
                        .orElseThrow();

        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        String cacheKey = user.getId() + ":" + windowFingerprint(transactions);
        SpendingCoachResponseDTO cached = coachCache.getIfPresent(cacheKey);
        if (cached != null) {
            metrics.aiCoachCacheHits.increment();
            return cached;
        }

        List<Map<String, Object>>
                payloadTransactions =
                new ArrayList<>();

        for (Transaction t : transactions) {

            Map<String, Object> map =
                    new HashMap<>();

            map.put("amount", t.getAmount());
            map.put("category", t.getCategory());
            map.put("merchant", t.getMerchant());
            map.put("date", t.getDate() != null ? t.getDate().toString() : null);

            payloadTransactions.add(map);
        }

        Map<String, Object> body =
                new HashMap<>();

        body.put(
                "transactions",
                payloadTransactions
        );

        HttpHeaders headers =
                new HttpHeaders();

        headers.setContentType(
                MediaType.APPLICATION_JSON
        );

        HttpEntity<Map<String, Object>>
                request =
                new HttpEntity<>(
                        body,
                        headers
                );

        try {
            ResponseEntity<SpendingCoachResponseDTO> response =
                    aiRestTemplate.exchange(
                            aiServiceUrl + "/spending-coach",
                            HttpMethod.POST,
                            request,
                            SpendingCoachResponseDTO.class
                    );
            if (response.getBody() != null) {
                metrics.aiCoachCalls.increment();
                coachCache.put(cacheKey, response.getBody());
                return response.getBody();
            }
        } catch (Exception e) {
            log.warn("AI spending coach unavailable, using statistical fallback: {}",
                    e.getMessage());
        }
        metrics.aiCoachFallbacks.increment();
        return buildFallback(transactions);
    }

    /**
     * Digest of everything about the window that can change the coach's
     * answer. Amounts are decrypted in memory by this point, so the digest
     * sees real values; nothing derived from it is persisted or logged.
     */
    static String windowFingerprint(List<Transaction> transactions) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (Transaction t : transactions) {
                String row = t.getId() + "|" + t.getAmount() + "|"
                        + t.getCategory() + "|" + t.getMerchant() + "|" + t.getDate();
                digest.update(row.getBytes(StandardCharsets.UTF_8));
                digest.update((byte) 0);
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e); // never on a JVM
        }
    }

    // Statistical fallback when the AI coach is down — same DTO shape.
    private SpendingCoachResponseDTO buildFallback(List<Transaction> transactions) {

        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);

        double income   = com.fintwin.util.TransactionMath.income(transactions);
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions);

        // "Leakage": monthly average of small discretionary debits (< ₹500) —
        // the spend that tends to go unnoticed.
        double leakage = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0
                        && Math.abs(t.getAmount()) < 500)
                .mapToDouble(t -> Math.abs(t.getAmount())).sum() / months;

        // Spending health means "how much of what you earn do you keep", so a
        // verdict is only given where the earnings are believable. Rating an
        // imported opening balance would print "Excellent" from a number that
        // is not income — the one lie this tile must never tell, and the reason
        // the AI engine withholds the verdict on the same data. The vocabulary
        // and thresholds below mirror ai-service (`spending_coach/coach_engine.py:
        // _health`) so the page reads the same whether or not the AI is up.
        boolean incomeReliable =
                com.fintwin.util.TransactionMath.incomeReliable(transactions);

        String health;
        if (!incomeReliable) {
            health = "Unrated";
        } else {
            double savingsRate = (income - expenses) / income * 100.0;
            health = savingsRate >= 30 ? "Excellent"
                   : savingsRate >= 15 ? "Good"
                   : savingsRate >= 5  ? "Average"
                   : "Poor";
        }

        List<String> tips = List.of(
                "Review small recurring charges — subscriptions under ₹500 add up fastest.",
                "Set category budgets for your top three spending categories.",
                "Automate a fixed transfer to savings on salary day, before discretionary spending."
        );

        SpendingCoachResponseDTO dto = new SpendingCoachResponseDTO();
        dto.setSpendingHealth(health);
        dto.setMonthlyLeakage(Math.round(leakage * 100.0) / 100.0);
        dto.setTips(tips);
        dto.setCoachMessage(
                "The AI coach is temporarily unavailable — these figures are computed "
                + "from your recent transactions. Check back later for personalised advice.");
        dto.setCoachMessageSource("analysis");

        // The page renders recommendations, not tips, so the generic advice is
        // offered in that shape too — without impact figures, which this
        // fallback has no analysis layer to compute.
        dto.setRecommendations(tips.stream().map(tip -> Map.<String, Object>of(
                "action", tip,
                "rationale", "",
                "source", "fallback"
        )).toList());
        dto.setInsights(List.of());

        // An unexplained "Not rated" reads as a broken page. Where the verdict
        // is withheld, the reason is stated here — the same contract the AI
        // engine's caveats honour.
        List<String> caveats = new ArrayList<>();
        caveats.add("The AI coach is offline — these are generic pointers, "
                + "not an analysis of your transactions.");
        if (income <= 0) {
            caveats.add("No income recorded in this window, so savings rate and the "
                    + "health verdict cannot be worked out.");
        } else if (!incomeReliable) {
            caveats.add(String.format(
                    "%.0f%% of recorded income arrived in a single month, which usually "
                    + "means an imported balance rather than earnings. Income, savings "
                    + "rate and the health verdict are withheld rather than reported "
                    + "from a number that is not earnings.",
                    com.fintwin.util.TransactionMath.incomeConcentration(transactions)));
        }

        dto.setCoverage(Map.of(
                "months", months,
                "transactions", transactions.size(),
                "confidence", "low",
                "caveats", caveats
        ));
        return dto;
    }
}