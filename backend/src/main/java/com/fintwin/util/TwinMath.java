package com.fintwin.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fintwin.model.Transaction;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.*;

/**
 * The Future Twin's inputs: the user, and a twin who also invests the money
 * the user didn't spend — what Spend Guard kept by pausing, and Jar-style
 * round-ups of every payment to the next ₹10. Nothing here moves money; the
 * twin shows what those habits would grow into.
 */
public final class TwinMath {

    private TwinMath() {}

    public static final int ROUND_TO = 10;

    /** Payments that aren't spending: investing, rent and loans don't get rounded up. */
    static final Set<String> NOT_ROUNDED = Set.of("Investments", "Rent", "Housing", "EMI", "Loan", "Insurance", "Transfer");

    public record RoundUps(String month, double amount, int payments) {}

    public record Wish(String name, double amount, String readySince) {}

    /** Round-ups over last calendar month's payments (a full month, so the figure doesn't jump about). */
    public static RoundUps roundUps(List<Transaction> recent, LocalDate today) {
        YearMonth last = YearMonth.from(today).minusMonths(1);
        double sum = 0;
        int n = 0;
        for (Transaction t : recent) {
            if (t.getAmount() == null || t.getAmount() >= 0 || t.getDate() == null) continue;
            if (!YearMonth.from(t.getDate()).equals(last)) continue;
            if (TransactionMath.isSelfTransfer(t) || NOT_ROUNDED.contains(t.getCategory())) continue;
            double paid = Math.abs(t.getAmount());
            double up = Math.ceil(paid / ROUND_TO) * ROUND_TO - paid;
            if (up < 0.005) continue;
            sum += up;
            n++;
        }
        return new RoundUps(last.toString(), Math.round(sum * 100) / 100.0, n);
    }

    /**
     * Wishlist items from Spend Guard's document whose 48-hour wait is over:
     * the "still want it?" moment. Only the name and amount are read, never
     * the payee or QR code stored with them.
     */
    public static List<Wish> readyWishes(JsonNode state, LocalDateTime now) {
        List<Wish> out = new ArrayList<>();
        JsonNode list = state == null ? null : state.path("wishlist");
        if (list == null || !list.isObject()) return out;
        list.elements().forEachRemaining(w -> {
            LocalDateTime ready = when(w.path("ready_at").asText(null));
            double amount = w.path("amount").asDouble(0);
            String name = w.path("name").asText("");
            if (ready == null || amount <= 0 || name.isBlank() || ready.isAfter(now)) return;
            out.add(new Wish(name.length() > 60 ? name.substring(0, 60) : name, amount, ready.toLocalDate().toString()));
        });
        out.sort(Comparator.comparing(Wish::readySince));
        return out;
    }

    static LocalDateTime when(String iso) {
        if (iso == null || iso.isBlank()) return null;
        try {
            return OffsetDateTime.parse(iso).atZoneSameInstant(java.time.ZoneId.of("Asia/Kolkata")).toLocalDateTime();
        } catch (Exception e) {
            try { return LocalDateTime.parse(iso); } catch (Exception ignored) { return null; }
        }
    }
}
