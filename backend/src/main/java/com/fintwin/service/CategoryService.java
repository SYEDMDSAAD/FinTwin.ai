package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.model.UserMerchantCategory;
import com.fintwin.repository.UserMerchantCategoryRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class CategoryService {

private static final Map<String, String> RULES = Map.ofEntries(

        Map.entry("swiggy", "Food"),
        Map.entry("zomato", "Food"),
        Map.entry("dominos", "Food"),
        Map.entry("mcdonald", "Food"),
        Map.entry("kfc", "Food"),

        Map.entry("uber", "Travel"),
        Map.entry("ola", "Travel"),
        Map.entry("rapido", "Travel"),

        Map.entry("amazon", "Shopping"),
        Map.entry("flipkart", "Shopping"),
        Map.entry("myntra", "Shopping"),
        Map.entry("ajio", "Shopping"),
        Map.entry("shopping", "Shopping"),

        Map.entry("electricity", "Bills"),
        Map.entry("bill", "Bills"),
        Map.entry("recharge", "Bills"),
        Map.entry("airtel", "Bills"),
        Map.entry("jio", "Bills"),

        Map.entry("salary", "Income"),
        Map.entry("bonus", "Income"),
        Map.entry("freelance", "Income"),

        // Money moving between the user's own accounts — excluded from
        // income/expense aggregates (see TransactionMath.isSelfTransfer)
        Map.entry("self transfer", "Transfer"),
        Map.entry("self-transfer", "Transfer"),
        Map.entry("own account", "Transfer"),
        Map.entry("transfer to self", "Transfer")
);

@Autowired
private UserMerchantCategoryRepository learnedRepo;

public String categorize(String merchant) {
    return categorize(merchant, Map.of());
}

/**
 * Categorize with the user's learned rules checked FIRST — a manual
 * correction the user made always beats the global keyword rules.
 * Pass the map from {@link #learnedRulesFor(User)} so bulk ingest paths
 * hit the DB once, not once per row.
 */
public String categorize(String merchant, Map<String, String> learnedRules) {

    if (merchant == null) {
        return "Other";
    }

    String value = normalizeMerchant(merchant);

    if (learnedRules != null && !learnedRules.isEmpty()) {
        String exact = learnedRules.get(value);
        if (exact != null) return exact;

        for (Map.Entry<String, String> rule : learnedRules.entrySet()) {
            if (value.contains(rule.getKey())) {
                return rule.getValue();
            }
        }
    }

    for (Map.Entry<String, String> rule :
            RULES.entrySet()) {

        if (value.contains(rule.getKey())) {

            return rule.getValue();
        }
    }

    return "Other";
}

/** Learned rules for a user: normalized merchant pattern → category. */
public Map<String, String> learnedRulesFor(User user) {
    Map<String, String> rules = new LinkedHashMap<>();
    for (UserMerchantCategory rule : learnedRepo.findByUser(user)) {
        rules.put(rule.getMerchantPattern(), rule.getCategory());
    }
    return rules;
}

/**
 * Upsert a learned rule after a manual recategorization, so every future
 * transaction from this payee auto-categorizes for this user.
 */
@Transactional
public void rememberRule(User user, String merchant, String category) {
    if (merchant == null || merchant.isBlank()
            || category == null || category.isBlank()) {
        return;
    }

    String normalized = normalizeMerchant(merchant);
    final String pattern = normalized.length() > 400
            ? normalized.substring(0, 400) : normalized;

    UserMerchantCategory rule = learnedRepo
            .findByUserAndMerchantPattern(user, pattern)
            .orElseGet(() -> {
                UserMerchantCategory r = new UserMerchantCategory();
                r.setUser(user);
                r.setMerchantPattern(pattern);
                return r;
            });

    rule.setCategory(category.trim());
    learnedRepo.save(rule);
}

/** Lowercase, trim, collapse internal whitespace. */
public String normalizeMerchant(String merchant) {
    return merchant == null
            ? ""
            : merchant.toLowerCase().trim().replaceAll("\\s+", " ");
}

}
