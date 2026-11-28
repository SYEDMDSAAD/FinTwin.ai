package com.fintwin.service;

import com.fintwin.util.MerchantCategorizer;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.*;

/**
 * The local model's category suggestion for payees the rules left in Other.
 * A suggestion depends only on the payee's name, so one answer serves every
 * user and is cached: the model is asked about each name once a week at most.
 * Nothing here changes a transaction: the user accepts or changes a
 * suggestion, and the sorting agent applies only the ones the model was sure of.
 */
@Service
public class CategorySuggestionService {

    private static final Logger log = LoggerFactory.getLogger(CategorySuggestionService.class);

    /** What the model said about one payee: a category ("" when it couldn't tell) and whether it was sure. */
    record Answer(String category, boolean sure) {}

    /** Normalised payee → the model's answer. */
    private final Cache<String, Answer> cache = Caffeine.newBuilder()
            .maximumSize(20_000)
            .expireAfterWrite(Duration.ofDays(7))
            .build();

    private final RestTemplate ai;
    private final String aiUrl;
    private final CategoryService categories;

    public CategorySuggestionService(@Qualifier("aiChatRestTemplate") RestTemplate ai,
                                     @Value("${ai.service.url}") String aiUrl,
                                     CategoryService categories) {
        this.ai = ai;
        this.aiUrl = aiUrl;
        this.categories = categories;
    }

    public record Suggestions(Map<String, String> byMerchant, boolean complete) {}

    /** The payee name the model sees, and the cache key for it. */
    String key(String merchant) {
        return categories.normalizeMerchant(MerchantCategorizer.payeeOf(merchant == null ? "" : merchant));
    }

    /**
     * Suggestions for these merchants, keyed by the normalised merchant text
     * (as {@link CategoryService#normalizeMerchant} gives it). Merchants the
     * model couldn't place are left out.
     */
    public Suggestions suggest(Collection<String> merchants) {
        Map<String, String> keyOf = new LinkedHashMap<>();          // merchant → payee key
        for (String m : merchants) if (m != null && !m.isBlank()) keyOf.put(m, key(m));

        Map<String, String> payeeByKey = new LinkedHashMap<>();     // key → name to send
        keyOf.forEach((m, k) -> {
            if (!k.isBlank() && cache.getIfPresent(k) == null)
                payeeByKey.putIfAbsent(k, MerchantCategorizer.payeeOf(m));
        });

        boolean complete = true;
        if (!payeeByKey.isEmpty()) complete = ask(payeeByKey);

        Map<String, String> out = new LinkedHashMap<>();
        keyOf.forEach((m, k) -> {
            Answer a = cache.getIfPresent(k);
            if (a != null && !a.category().isEmpty()) out.put(categories.normalizeMerchant(m), a.category());
        });
        return new Suggestions(out, complete);
    }

    /**
     * Only the suggestions the model was sure of, keyed by normalised
     * merchant — what the sorting agent may apply without asking.
     */
    public Map<String, String> sureSuggestions(Collection<String> merchants) {
        suggest(merchants);
        Map<String, String> out = new LinkedHashMap<>();
        for (String m : merchants) {
            if (m == null || m.isBlank()) continue;
            Answer a = cache.getIfPresent(key(m));
            if (a != null && a.sure() && !a.category().isEmpty()) out.put(categories.normalizeMerchant(m), a.category());
        }
        return out;
    }

    /** The suggestion shown for this merchant, if there is one — to check what a user says they accepted. */
    public Optional<String> shown(String merchant) {
        Answer a = cache.getIfPresent(key(merchant));
        return a == null || a.category().isEmpty() ? Optional.empty() : Optional.of(a.category());
    }

    @SuppressWarnings("unchecked")
    private boolean ask(Map<String, String> payeeByKey) {
        List<String> payees = new ArrayList<>(payeeByKey.values());
        try {
            Map<String, Object> resp = ai.postForObject(aiUrl + "/categories/suggest",
                    Map.of("payees", payees.subList(0, Math.min(payees.size(), 60))), Map.class);
            if (resp == null) return false;
            Map<String, Object> got = (Map<String, Object>) resp.getOrDefault("suggestions", Map.of());
            // Absent from older ai-service versions: then nothing counts as sure.
            Map<String, Object> sure = (Map<String, Object>) resp.getOrDefault("sure", Map.of());
            payeeByKey.forEach((k, payee) -> {
                if (got.containsKey(payee)) {
                    Object v = got.get(payee);
                    cache.put(k, new Answer(v instanceof String s ? s : "", Boolean.TRUE.equals(sure.get(payee))));
                }
            });
            return Boolean.TRUE.equals(resp.get("complete")) && payees.size() <= 60;
        } catch (RestClientException e) {
            // No payee names in the log: they can identify the user's contacts
            log.warn("Category suggestions unavailable: {}", e.getClass().getSimpleName());
            return false;
        }
    }
}
