package com.fintwin.service;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.util.BankAlertParser;
import com.fintwin.util.Categorized;
import com.fintwin.util.TransactionMath;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Turns one parsed bank alert into a transaction, the same way whether the
 * alert came as a forwarded email or as an SMS read on the user's phone:
 * skip it if this alert was imported before or the same money is already on
 * record from another source, otherwise categorise and save it.
 */
@Component
public class AlertImporter {

    public enum Status { IMPORTED, DUPLICATE, ON_RECORD }

    /**
     * @param transactionId the new transaction, or the one already on record
     */
    public record Result(Status status, String accountRef, Long transactionId) {}

    private final TransactionRepository transactions;
    private final CategoryService categories;
    private final CacheManager caches;

    public AlertImporter(TransactionRepository transactions, CategoryService categories, CacheManager caches) {
        this.transactions = transactions;
        this.categories = categories;
        this.caches = caches;
    }

    /**
     * @param externalId stable id of this alert, so a re-send is not counted twice
     * @param source     transaction source for bank-account alerts (card alerts are "CARD")
     */
    public Result importAlert(User user, String bank, BankAlertParser.Alert alert,
                              String externalId, String source) {
        String accountRef = alert.last4() == null ? bank : bank + " ··" + alert.last4();

        if (transactions.findByUserAndExternalId(user, externalId).isPresent()) {
            return new Result(Status.DUPLICATE, accountRef, null);
        }

        // The same money may already be on record from a statement, a bank
        // link, an email alert or a manual entry: it must not count twice
        List<Transaction> nearby = transactions.findSince(user.getId(), alert.date().minusDays(2));
        Optional<Transaction> already = nearby.stream()
                .filter(t -> t.getAmount() != null && t.getDate() != null)
                .filter(t -> Math.abs(t.getAmount() - alert.amount()) < 0.005)
                .filter(t -> Math.abs(t.getDate().toEpochDay() - alert.date().toEpochDay()) <= 1)
                .filter(t -> t.getAccountRef() == null || t.getAccountRef().equals(accountRef))
                .findFirst();
        if (already.isPresent()) {
            return new Result(Status.ON_RECORD, accountRef, already.get().getId());
        }

        String merchant = alert.counterparty() != null ? alert.counterparty()
                : alert.card() ? bank + " card " + (alert.amount() < 0 ? "spend" : "credit")
                : describeChannel(alert);
        boolean cardDataPresent = alert.card() || transactions.countByUserAndSource(user, "CARD") > 0;
        String forced = TransactionMath.forcedImportCategory(merchant, alert.amount(), alert.card(), cardDataPresent);
        Categorized category = forced != null
                ? new Categorized(forced, Categorized.FORCED)
                : categories.classify(merchant, categories.learnedRulesFor(user), alert.amount());

        Transaction t = new Transaction();
        t.setUser(user);
        t.setDate(alert.date());
        t.setMerchant(merchant);
        t.setAmount(alert.amount());
        t.applyPrediction(category);
        t.setSource(alert.card() ? "CARD" : source);
        t.setExternalId(externalId);
        t.setAccountRef(accountRef);
        Transaction saved = transactions.save(t);

        if (alert.card()) {
            // First card purchases on record: bank-side bill payments already
            // imported now duplicate them, exactly as with a card statement
            List<Transaction> restamped = TransactionMath.restampCardBillPayments(transactions.findByUser(user));
            if (!restamped.isEmpty()) transactions.saveAll(restamped);
        }
        return new Result(Status.IMPORTED, accountRef, saved.getId());
    }

    /** Insights and the score are cached per user; new transactions make them stale. */
    public void evictUserCaches(User user) {
        for (String name : List.of("user-insights", "user-score")) {
            Cache cache = caches.getCache(name);
            if (cache != null && user.getEmail() != null) cache.evict(user.getEmail());
        }
    }

    private static String describeChannel(BankAlertParser.Alert alert) {
        String dir = alert.amount() < 0 ? "payment" : "credit";
        return alert.channel() == null ? "Bank " + dir : alert.channel() + " " + dir;
    }
}
