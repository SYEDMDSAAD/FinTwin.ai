package com.fintwin.service;

import com.fintwin.model.Transaction;
import org.springframework.stereotype.Service;

import java.util.Arrays;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class ExpenseParserService {

    // Matches optional currency prefix + numeric amount
    private static final Pattern AMOUNT_PATTERN =
            Pattern.compile("(?:₹|Rs\\.?\\s*|INR\\s*)?(\\d[\\d,]*(?:\\.\\d+)?)",
                    Pattern.CASE_INSENSITIVE);

    // Matches merchant name (1-2 words) after common prepositions
    private static final Pattern MERCHANT_KEYWORD_PATTERN =
            Pattern.compile("\\b(?:at|from|@|on)\\s+([A-Za-z][A-Za-z0-9&'\\-]*(?:\\s+[A-Za-z][A-Za-z0-9&'\\-]*)?)",
                    Pattern.CASE_INSENSITIVE);

    // Trailing words that indicate a category, not part of the merchant name
    private static final Set<String> CATEGORY_SUFFIXES = Set.of(
            "clothes", "clothing", "grocery", "groceries", "food", "subscription",
            "service", "medicine", "medicines", "bill", "bills", "fee", "fees",
            "charges", "charge", "items", "stuff"
    );

    private static final Set<String> STOP_WORDS = Set.of(
            "paid", "pay", "paying", "bought", "buy", "spent", "spend",
            "ordered", "order", "got", "get", "sent", "send", "purchase",
            "the", "a", "an", "for", "at", "on", "from", "to", "of",
            "in", "by", "with", "and", "rs", "inr", "rupees"
    );

    public Transaction parseExpense(String input) {
        if (input == null || input.isBlank()) {
            return buildTransaction("Unknown", 0);
        }

        String normalized = input.trim();

        // Extract amount: iterate all matches, last numeric value wins (price is usually stated last)
        double amount = 0;
        Matcher amountMatcher = AMOUNT_PATTERN.matcher(normalized);
        while (amountMatcher.find()) {
            try {
                amount = Double.parseDouble(amountMatcher.group(1).replace(",", ""));
            } catch (NumberFormatException ignored) {}
        }

        // Primary: extract merchant from "at X", "from X", "@ X", "on X" pattern
        String merchant = null;
        Matcher keywordMatcher = MERCHANT_KEYWORD_PATTERN.matcher(normalized);
        if (keywordMatcher.find()) {
            String raw = keywordMatcher.group(1).trim();
            // Strip trailing category words (e.g., "Zara clothes" → "Zara")
            String[] words = raw.split("\\s+");
            int end = words.length;
            while (end > 1 && CATEGORY_SUFFIXES.contains(words[end - 1].toLowerCase())) {
                end--;
            }
            raw = String.join(" ", Arrays.copyOf(words, end));
            if (!raw.isEmpty()) {
                merchant = toTitleCase(raw);
            }
        }

        // Fallback: first non-stop, non-numeric word (typically the merchant stated upfront)
        if (merchant == null) {
            for (String word : normalized.split("\\s+")) {
                String alpha = word.replaceAll("[^A-Za-z]", "");
                if (!alpha.isEmpty() && !STOP_WORDS.contains(alpha.toLowerCase())
                        && !word.matches(".*\\d.*")) {
                    merchant = toTitleCase(word.replaceAll("[^A-Za-z0-9&'\\-]", ""));
                    break;
                }
            }
        }

        return buildTransaction(merchant != null ? merchant : "Unknown", amount);
    }

    private Transaction buildTransaction(String merchant, double amount) {
        Transaction transaction = new Transaction();
        transaction.setMerchant(merchant);
        transaction.setAmount(-amount);
        transaction.setDate(java.time.LocalDate.now());
        return transaction;
    }

    private String toTitleCase(String s) {
        String[] words = s.trim().split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (!word.isEmpty()) {
                if (sb.length() > 0) sb.append(" ");
                sb.append(Character.toUpperCase(word.charAt(0)));
                if (word.length() > 1) sb.append(word.substring(1));
            }
        }
        return sb.toString();
    }
}
