package com.fintwin.agent;

import com.fintwin.model.AgentAlert;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.AgentAlertRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.service.CategoryService;
import com.fintwin.service.CategorySuggestionService;
import com.fintwin.service.TransactionService;
import com.fintwin.util.Categorized;
import com.fintwin.util.MerchantCategorizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

/**
 * Sorts payees the rules left in Other, without asking, when the model is
 * sure of the category — the rest stay in Other with a suggestion for the
 * user. Each auto-sorted row is marked {@link Categorized#LLM_AUTO}, so it
 * can be listed for review, corrected (which teaches a rule) or confirmed.
 * A category the user chose, or reviewed, is never touched.
 */
@Component
public class SortingAgent {

    private static final Logger log = LoggerFactory.getLogger(SortingAgent.class);

    /** Payees per run: the biggest spends first, three model batches at most. */
    static final int MAX_PAYEES = 45;
    /** How long an import waits for the model; a late answer still fills the cache for next time. */
    static final long WAIT_SECONDS = 25;

    private final TransactionRepository transactions;
    private final CategorySuggestionService suggestions;
    private final CategoryService categories;
    private final AgentAlertRepository alerts;
    /** Own transaction: after the import commits, saves would otherwise join the finished one and be lost. */
    private final TransactionTemplate writes;
    private final ExecutorService pool = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "sorting-agent");
        t.setDaemon(true);
        return t;
    });

    public SortingAgent(TransactionRepository transactions, CategorySuggestionService suggestions,
                        CategoryService categories, AgentAlertRepository alerts,
                        PlatformTransactionManager txManager) {
        this.transactions = transactions;
        this.suggestions = suggestions;
        this.categories = categories;
        this.alerts = alerts;
        this.writes = new TransactionTemplate(txManager);
        this.writes.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public record Result(int payees, int payments) {
        static final Result NONE = new Result(0, 0);
    }

    /** Sorts what it's sure of and records a summary for the bell. Never throws. */
    public Result run(User user) {
        try {
            // Read, ask the model, write: each database step in its own short
            // transaction, and none held open while the model thinks.
            Map<String, List<Transaction>> groups = writes.execute(s -> candidateGroups(user, java.time.LocalDate.now()));
            if (groups.isEmpty()) return Result.NONE;

            List<String> merchants = groups.values().stream().map(g -> g.get(0).getMerchant()).toList();
            Future<Map<String, String>> asked = pool.submit(() -> suggestions.sureSuggestions(merchants));
            Map<String, String> sure;
            try {
                sure = asked.get(WAIT_SECONDS, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                log.info("Sorting agent: model too slow for user #{}, leaving it for next time", user.getId());
                return Result.NONE;
            }

            int payees = 0;
            List<Transaction> changed = new ArrayList<>();
            List<String> names = new ArrayList<>();
            for (Map.Entry<String, List<Transaction>> g : groups.entrySet()) {
                String category = sure.get(categories.normalizeMerchant(g.getValue().get(0).getMerchant()));
                if (category == null) continue;
                boolean any = false;
                for (Transaction t : g.getValue()) {
                    // A rule's guess the model agrees with stays as it is
                    if (category.equalsIgnoreCase(t.getCategory())) continue;
                    t.applyPrediction(new Categorized(category, Categorized.LLM_AUTO));
                    changed.add(t);
                    any = true;
                }
                if (!any) continue;
                payees++;
                if (names.size() < 3) names.add(MerchantCategorizer.payeeOf(g.getValue().get(0).getMerchant()));
            }
            if (changed.isEmpty()) return Result.NONE;

            final int sortedPayees = payees;
            try {
                writes.executeWithoutResult(s -> {
                    transactions.saveAll(changed);
                    record(user, sortedPayees, changed.size(), names);
                });
            } catch (ObjectOptimisticLockingFailureException e) {
                // The user edited one of these while the model was thinking: their edit wins.
                log.info("Sorting agent: rows changed underneath for user #{}, skipped this run", user.getId());
                return Result.NONE;
            }
            log.info("Sorting agent: sorted {} payees ({} payments) for user #{}", payees, changed.size(), user.getId());
            return new Result(payees, changed.size());
        } catch (RuntimeException | InterruptedException | ExecutionException e) {
            if (e instanceof InterruptedException) Thread.currentThread().interrupt();
            log.warn("Sorting agent failed for user #{}: {}", user.getId(), e.getClass().getSimpleName());
            return Result.NONE;
        }
    }

    /** How far back the agent double-checks the rules' guesses (unsorted rows: any age). */
    static final int GUESS_DAYS = 60;

    /**
     * What the agent looks at, grouped by payee, biggest spend first: debits
     * still in Other, then recent rows where a rule only guessed. Two guesses
     * go wrong often enough to check:
     *  - PERSON: "Paid to Sunrise Interiors And Modular Kitchens" read as a
     *    person's name. A masked contact or phone-number UPI ID is certainly a
     *    person and is never re-checked; the model has no People category and
     *    answers Unknown for a name, so a real person stays a person.
     *  - SHOP_WORD: one word decided it ("…Furniture Mart" as Groceries).
     * Nothing the user chose, reviewed or taught (USER, SEED, LEARNED) is touched.
     */
    Map<String, List<Transaction>> candidateGroups(User user, java.time.LocalDate today) {
        Map<String, List<Transaction>> unsorted = new HashMap<>(), guessed = new HashMap<>();
        java.time.LocalDate guessFrom = today.minusDays(GUESS_DAYS);
        for (Transaction t : transactions.findByUser(user)) {
            if (t.getAmount() == null || t.getAmount() >= 0) continue;
            if (t.getCategoryReview() != null) continue;
            if (t.getMerchant() == null || t.getMerchant().isBlank()) continue;
            String src = t.getCategorySource();
            if (Categorized.USER.equals(src) || Categorized.SEED.equals(src)) continue;
            Map<String, List<Transaction>> into;
            if (TransactionService.unsorted(t)) into = unsorted;
            else if (isGuess(t) && t.getDate() != null && !t.getDate().isBefore(guessFrom)) into = guessed;
            else continue;
            into.computeIfAbsent(payeeKey(categories, t.getMerchant()), k -> new ArrayList<>()).add(t);
        }
        guessed.keySet().removeAll(unsorted.keySet());
        Map<String, List<Transaction>> ordered = new LinkedHashMap<>();
        for (Map<String, List<Transaction>> part : List.of(unsorted, guessed)) {
            part.entrySet().stream()
                    .sorted((a, b) -> Double.compare(spend(b.getValue()), spend(a.getValue())))
                    .limit(Math.max(0, MAX_PAYEES - ordered.size()))
                    .forEach(e -> ordered.put(e.getKey(), e.getValue()));
        }
        return ordered;
    }

    static boolean isGuess(Transaction t) {
        String src = t.getCategorySource();
        if (Categorized.SHOP_WORD.equals(src)) return true;
        return Categorized.PERSON.equals(src) && !MerchantCategorizer.isCertainPerson(t.getMerchant());
    }

    /**
     * One payee however its rows are worded: the payee name without the bank's
     * reference numbers — the same name the model is asked about.
     */
    public static String payeeKey(CategoryService categories, String merchant) {
        return categories.normalizeMerchant(MerchantCategorizer.payeeOf(merchant == null ? "" : merchant));
    }

    private static double spend(List<Transaction> ts) {
        return ts.stream().mapToDouble(t -> -t.getAmount()).sum();
    }

    private void record(User user, int payees, int payments, List<String> names) {
        alerts.save(summary(user, payees, payments, names));
    }

    /** The bell's "FinTwin sorted N payments" line (also used for the demo account). */
    public static AgentAlert summary(User user, int payees, int payments, List<String> names) {
        AgentAlert a = new AgentAlert();
        a.setUser(user);
        a.setAgent(AgentAlert.SORT);
        a.setPatternKey("sort-" + UUID.randomUUID().toString().replace("-", ""));
        a.setSeverity("info");
        String who = String.join(", ", names) + (payees > names.size() ? " and " + (payees - names.size()) + " more" : "");
        a.setMessage("FinTwin sorted " + payments + (payments == 1 ? " payment" : " payments") + " to "
                + payees + (payees == 1 ? " payee" : " payees") + " (" + who + "). Check them under Transactions.");
        a.setCreatedAt(LocalDateTime.now());
        return a;
    }
}
