package com.fintwin.controller;

import com.fintwin.model.Asset;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.InsurancePolicy;
import com.fintwin.model.Investment;
import com.fintwin.model.Liability;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.AssetRepository;
import com.fintwin.repository.InsurancePolicyRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.LiabilityRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.service.BudgetService;
import com.fintwin.service.GoalPlannerService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Data API for the AI service's tool calls. The copilot no longer receives a
 * pre-stuffed data blob — it requests exactly what a question needs through
 * these endpoints (service-to-service, never exposed to browsers).
 *
 * Auth: X-Internal-Key must match AI_INTERNAL_KEY — the same shared secret the
 * backend already uses when calling the AI service in the other direction.
 */
@RestController
@RequestMapping("/internal/ai")
public class InternalAIController {

    private static final Logger log = LoggerFactory.getLogger(InternalAIController.class);

    @Value("${ai.service.internal-key}")
    private String internalKey;

    private final UserRepository userRepo;
    private final TransactionRepository txnRepo;
    private final BudgetService budgetService;
    private final GoalPlannerService goalPlannerService;
    private final AssetRepository assetRepo;
    private final LiabilityRepository liabilityRepo;
    private final InvestmentRepository investmentRepo;
    private final InsurancePolicyRepository insuranceRepo;

    public InternalAIController(
            UserRepository userRepo,
            TransactionRepository txnRepo,
            BudgetService budgetService,
            GoalPlannerService goalPlannerService,
            AssetRepository assetRepo,
            LiabilityRepository liabilityRepo,
            InvestmentRepository investmentRepo,
            InsurancePolicyRepository insuranceRepo
    ) {
        this.userRepo           = userRepo;
        this.txnRepo            = txnRepo;
        this.budgetService      = budgetService;
        this.goalPlannerService = goalPlannerService;
        this.assetRepo      = assetRepo;
        this.liabilityRepo  = liabilityRepo;
        this.investmentRepo = investmentRepo;
        this.insuranceRepo  = insuranceRepo;
    }

    // ── Transactions ──────────────────────────────────────────────────────────
    // sort=amount → biggest spends first; sort=date → newest first.
    // type=expense|income|all filters by amount sign.
    // groupBy=merchant|category → aggregate over ALL matching rows (sum + count
    // per group) instead of listing individual transactions; limit then caps
    // the number of groups returned, not the rows aggregated.

    @GetMapping("/{userId}/transactions")
    public ResponseEntity<?> transactions(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @PathVariable Long userId,
            @RequestParam(required = false) String category,
            @RequestParam(defaultValue = "date") String sort,
            @RequestParam(defaultValue = "expense") String type,
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(defaultValue = "3") int months,
            @RequestParam(required = false) String groupBy
    ) {
        ResponseEntity<?> denied = requireKey(key);
        if (denied != null) return denied;
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        int cappedLimit  = Math.min(Math.max(limit, 1), 25);
        int cappedMonths = Math.min(Math.max(months, 1), 12);
        LocalDate cutoff = LocalDate.now().minusMonths(cappedMonths - 1).withDayOfMonth(1);
        String wantedCategory = category != null && !category.isBlank()
                ? category.trim().toLowerCase() : null;

        List<Map<String, Object>> rows = new ArrayList<>();
        for (Transaction t : txnRepo.findByUser(user)) {
            if (t.getAmount() == null || t.getDate() == null) continue;
            if (t.getDate().isBefore(cutoff)) continue;
            if ("expense".equals(type) && t.getAmount() >= 0) continue;
            if ("income".equals(type)  && t.getAmount() <= 0) continue;
            String cat = t.getCategory() != null ? t.getCategory() : "Other";
            if (wantedCategory != null && !cat.toLowerCase().equals(wantedCategory)) continue;

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("date",     t.getDate().toString());
            row.put("merchant", t.getMerchant());
            row.put("category", cat);
            double amount = Math.round(t.getAmount() * 100.0) / 100.0;
            row.put("amount",          amount);
            row.put("amountFormatted", inr(amount));
            rows.add(row);
        }

        if ("merchant".equals(groupBy) || "category".equals(groupBy)) {
            return ResponseEntity.ok(groupRows(rows, groupBy, cappedLimit));
        }

        Comparator<Map<String, Object>> cmp = "amount".equals(sort)
                ? Comparator.comparingDouble(r -> -Math.abs((Double) r.get("amount")))
                : Comparator.comparing((Map<String, Object> r) -> (String) r.get("date")).reversed();
        rows.sort(cmp);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("totalMatching", rows.size());
        body.put("transactions", rows.subList(0, Math.min(cappedLimit, rows.size())));
        return ResponseEntity.ok(body);
    }

    private Map<String, Object> groupRows(List<Map<String, Object>> rows, String groupBy, int limit) {
        Map<String, double[]> totals = new LinkedHashMap<>(); // name → [sum, count]
        for (Map<String, Object> row : rows) {
            String name = "merchant".equals(groupBy)
                    ? counterpartyName((String) row.get("merchant"))
                    : (String) row.get("category");
            double[] agg = totals.computeIfAbsent(name, k -> new double[2]);
            agg[0] += Math.abs((Double) row.get("amount"));
            agg[1] += 1;
        }

        List<Map<String, Object>> groups = new ArrayList<>();
        totals.entrySet().stream()
                .sorted((a, b) -> Double.compare(b.getValue()[0], a.getValue()[0]))
                .limit(limit)
                .forEach(e -> {
                    Map<String, Object> g = new LinkedHashMap<>();
                    g.put(groupBy, e.getKey());
                    g.put("totalAmount", Math.round(e.getValue()[0]));
                    g.put("totalAmountFormatted", inr(Math.round(e.getValue()[0])));
                    g.put("transactionCount", (int) e.getValue()[1]);
                    groups.add(g);
                });

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("totalTransactionsAggregated", rows.size());
        body.put("groupedBy", groupBy);
        body.put("groups", groups);
        return body;
    }

    /**
     * Bank/UPI narrations look like "037239215266/Tushar Khalsa/XDSK/85411942" —
     * the human counterparty is the segment made of letters and spaces that isn't
     * a short all-caps bank code. Falls back to the raw string for plain merchants.
     */
    private String counterpartyName(String merchant) {
        if (merchant == null || merchant.isBlank()) return "Unknown";
        for (String part : merchant.split("/")) {
            String p = part.trim();
            if (p.length() >= 3 && p.matches("[A-Za-z .'&-]+") && !p.matches("[A-Z]{3,5}")) {
                return p;
            }
        }
        return merchant.trim();
    }

    // ── Budgets: every budget with limit/spent/remaining, not just breaches ───

    @GetMapping("/{userId}/budgets")
    public ResponseEntity<?> budgets(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @PathVariable Long userId
    ) {
        ResponseEntity<?> denied = requireKey(key);
        if (denied != null) return denied;
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        List<Map<String, Object>> budgets = new ArrayList<>();
        budgetService.getBudgetStatusFor(user).forEach(b -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("category",  b.getCategory());
            row.put("limit",     b.getLimit());
            row.put("spent",     b.getSpent());
            row.put("remaining", b.getRemaining());
            row.put("exceeded",  b.getExceeded());
            budgets.add(row);
        });
        return ResponseEntity.ok(Map.of("budgets", budgets));
    }

    // ── Goals ─────────────────────────────────────────────────────────────────

    @GetMapping("/{userId}/goals")
    public ResponseEntity<?> goals(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @PathVariable Long userId
    ) {
        ResponseEntity<?> denied = requireKey(key);
        if (denied != null) return denied;
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        // Recalculated via the service — repository fields for progress/saved are
        // stale (recomputed in-memory on every fetch, never persisted).
        List<FinancialGoal> all = goalPlannerService.getGoalsForUser(user);

        int completedCount = 0;
        List<Map<String, Object>> goals = new ArrayList<>();
        for (FinancialGoal g : all) {
            boolean done = Boolean.TRUE.equals(g.getCompleted());
            if (done) completedCount++;

            double target = g.getTargetAmount() != null ? g.getTargetAmount() : 0;
            // A completed goal is fully funded by definition; expectedSaved is the
            // live figure the UI shows for ongoing goals.
            double saved = done ? target
                    : (g.getExpectedSaved() != null ? g.getExpectedSaved() : 0);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("title",  g.getTitle());
            row.put("status", done ? "Completed" : "Ongoing");
            row.put("targetAmount",          Math.round(target));
            row.put("targetAmountFormatted", inr(target));
            row.put("savedSoFar",            Math.round(saved));
            row.put("savedSoFarFormatted",   inr(saved));
            row.put("durationMonths",        g.getDurationMonths());
            if (done) {
                row.put("completedOn", g.getCompletedAt() != null ? g.getCompletedAt().toString() : null);
            } else {
                row.put("progressPercent", g.getProgressPercent());
                row.put("monthlyTarget",   g.getMonthlyTarget());
                row.put("goalHealth",      g.getGoalHealth());
            }
            goals.add(row);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("totalGoals",    all.size());
        body.put("completedGoals", completedCount);
        body.put("ongoingGoals",  all.size() - completedCount);
        body.put("goals", goals);
        return ResponseEntity.ok(body);
    }

    // ── Net worth: assets, liabilities, investments, insurance ───────────────

    @GetMapping("/{userId}/networth")
    public ResponseEntity<?> netWorth(
            @RequestHeader(value = "X-Internal-Key", required = false) String key,
            @PathVariable Long userId
    ) {
        ResponseEntity<?> denied = requireKey(key);
        if (denied != null) return denied;
        User user = userRepo.findById(userId).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        double totalAssets = 0, totalLiabilities = 0, totalInvested = 0, totalCurrent = 0;

        List<Map<String, Object>> assets = new ArrayList<>();
        for (Asset a : assetRepo.findByUser(user)) {
            double amt = a.getAmount() != null ? a.getAmount().doubleValue() : 0;
            totalAssets += amt;
            assets.add(Map.of(
                    "name", nullSafe(a.getName()),
                    "type", nullSafe(a.getType()),
                    "amount", amt));
        }

        List<Map<String, Object>> liabilities = new ArrayList<>();
        for (Liability l : liabilityRepo.findByUser(user)) {
            double amt = l.getAmount() != null ? l.getAmount().doubleValue() : 0;
            totalLiabilities += amt;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name",         nullSafe(l.getName()));
            row.put("type",         nullSafe(l.getType()));
            row.put("outstanding",  amt);
            row.put("interestRate", l.getInterestRate());
            row.put("emi",          l.getEmi());
            row.put("termMonths",   l.getTermMonths());
            liabilities.add(row);
        }

        List<Map<String, Object>> investments = new ArrayList<>();
        for (Investment inv : investmentRepo.findByUser(user)) {
            double invested = inv.getInvestedAmount() != null ? inv.getInvestedAmount().doubleValue() : 0;
            double current  = inv.getCurrentValue()   != null ? inv.getCurrentValue().doubleValue()   : invested;
            totalInvested += invested;
            totalCurrent  += current;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("name",         nullSafe(inv.getName()));
            row.put("type",         nullSafe(inv.getType()));
            row.put("invested",     invested);
            row.put("currentValue", current);
            investments.add(row);
        }

        List<Map<String, Object>> insurance = new ArrayList<>();
        for (InsurancePolicy p : insuranceRepo.findByUserOrderByCreatedAtDesc(user)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("type",       nullSafe(p.getType()));
            row.put("provider",   nullSafe(p.getProvider()));
            row.put("premium",    nullSafe(p.getPremium()));
            row.put("frequency",  nullSafe(p.getFrequency()));
            row.put("sumAssured", nullSafe(p.getSumAssured()));
            insurance.add(row);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("totalAssets",           Math.round(totalAssets));
        body.put("totalLiabilities",      Math.round(totalLiabilities));
        body.put("investmentsInvested",   Math.round(totalInvested));
        body.put("investmentsCurrent",    Math.round(totalCurrent));
        body.put("netWorth",              Math.round(totalAssets + totalCurrent - totalLiabilities));
        body.put("assets",      assets);
        body.put("liabilities", liabilities);
        body.put("investments", investments);
        body.put("insurance",   insurance);
        return ResponseEntity.ok(body);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ResponseEntity<?> requireKey(String key) {
        if (internalKey == null || internalKey.isBlank()
                || key == null || !internalKey.equals(key)) {
            log.warn("Internal AI API called with missing/invalid key");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid internal key"));
        }
        return null;
    }

    private String nullSafe(String v) {
        return v != null ? v : "";
    }

    // Small LLMs mangle digit grouping when formatting numbers themselves —
    // ship display-ready Indian-grouped amounts (lakh/crore) so they can
    // quote verbatim. Built by hand: JDK NumberFormat/DecimalFormat both
    // emit western grouping for en-IN.
    private String inr(double v) {
        long paise  = Math.round(Math.abs(v) * 100);
        String digits = Long.toString(paise / 100);
        long frac   = paise % 100;

        StringBuilder sb = new StringBuilder(v < 0 ? "-₹" : "₹");
        int len = digits.length();
        for (int i = 0; i < len; i++) {
            sb.append(digits.charAt(i));
            int remaining = len - i - 1;
            if (remaining == 3 || (remaining > 3 && remaining % 2 == 1)) sb.append(',');
        }
        if (frac > 0) sb.append(String.format(".%02d", frac));
        return sb.toString();
    }
}
