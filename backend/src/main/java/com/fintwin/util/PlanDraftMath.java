package com.fintwin.util;

import com.fintwin.model.Transaction;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.*;
import java.util.stream.Collectors;

/**
 * A first plan drafted from the user's own transactions, so nobody has to
 * start from an empty budget screen.
 *
 * <ul>
 *   <li><b>Salary</b>: the same payer crediting a similar amount around the
 *       same day in at least two different months.</li>
 *   <li><b>Budgets</b>: what each category typically costs per month (the
 *       median of the complete months on record, so one big month doesn't set
 *       the bar), essentials as they are, everyday spending a little lower so
 *       there's something left to save.</li>
 * </ul>
 *
 * Pure arithmetic on what's on record; the user approves or edits every line.
 */
public final class PlanDraftMath {

    private PlanDraftMath() {}

    /** Kept at what they cost: cutting rent or a bill on paper saves nothing. */
    public static final Set<String> ESSENTIAL = Set.of(
            "Rent", "Bills", "EMI", "Health", "Education", "Groceries", "Insurance", "Transport");

    /** Not spending: money moved, saved or repaid elsewhere. */
    static final Set<String> NOT_SPENDING = Set.of(
            "Transfer", "Investments", "Savings", TransactionMath.CARD_PAYMENT_CATEGORY, "Income", "Salary");

    /** Everyday spending is drafted this much under what it typically costs. */
    static final double EVERYDAY_TRIM = 0.10;
    /** A category typically under this a month isn't worth a budget line. */
    static final double MIN_BUDGET = 300;
    static final double MIN_SALARY = 5_000;
    /** How far a month's salary may stray from the usual and still be the salary. */
    static final double SALARY_VARIATION = 0.25;
    /** How many days the salary date may drift month to month. */
    static final int SALARY_DAY_DRIFT = 6;
    static final int MAX_MONTHS = 3;

    /** @param lastAmount what the latest salary credit (on {@code lastPaid}) actually was */
    public record Salary(String payer, double typicalAmount, int typicalDay, int months,
                         LocalDate lastPaid, double lastAmount, LocalDate nextExpected) {}

    public record BudgetLine(String category, double typical, double suggested, boolean essential,
                             Double currentLimit, String reason) {}

    /**
     * @param monthsUsed  complete months the figures come from (0 = not enough data yet)
     * @param plannedShareOfIncome suggested budgets as a % of the salary, or null without one
     */
    public record Draft(Salary salary, List<BudgetLine> budgets, int monthsUsed,
                        double typicalMonthlySpend, Integer plannedShareOfIncome) {}

    public static Draft draft(List<Transaction> transactions, Map<String, Double> currentLimits, LocalDate today) {
        List<Transaction> usable = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getDate() != null && !t.getDate().isAfter(today))
                .filter(t -> !TransactionMath.isSelfTransfer(t))
                .toList();
        Salary salary = detectSalary(usable, today);
        List<YearMonth> months = completeMonths(usable, today);

        Map<String, String> limitKeys = new HashMap<>();
        currentLimits.keySet().forEach(k -> limitKeys.put(k.toLowerCase(Locale.ROOT), k));

        List<BudgetLine> lines = new ArrayList<>();
        double typicalTotal = 0;
        if (!months.isEmpty()) {
            Set<YearMonth> window = new HashSet<>(months);
            Map<String, Map<YearMonth, Double>> byCategory = new HashMap<>();
            for (Transaction t : usable) {
                if (t.getAmount() >= 0 || !window.contains(YearMonth.from(t.getDate()))) continue;
                String category = t.getCategory() == null || t.getCategory().isBlank() ? "Other" : t.getCategory();
                if (NOT_SPENDING.contains(category)) continue;
                byCategory.computeIfAbsent(category, c -> new HashMap<>())
                        .merge(YearMonth.from(t.getDate()), -t.getAmount(), Double::sum);
            }
            for (var e : byCategory.entrySet()) {
                double[] perMonth = months.stream().mapToDouble(m -> e.getValue().getOrDefault(m, 0.0)).toArray();
                double typical = median(perMonth);
                typicalTotal += typical;
                if (typical < MIN_BUDGET) continue;
                boolean essential = ESSENTIAL.contains(e.getKey());
                double suggested = essential ? roundUp(typical, 100) : roundNearest(typical * (1 - EVERYDAY_TRIM), 100);
                String key = limitKeys.get(e.getKey().toLowerCase(Locale.ROOT));
                Double current = key == null ? null : currentLimits.get(key);
                lines.add(new BudgetLine(e.getKey(), round2(typical), suggested, essential, current,
                        reason(typical, essential, months.size())));
            }
        }
        lines.sort(Comparator.comparing(BudgetLine::essential).reversed()
                .thenComparing(Comparator.comparingDouble(BudgetLine::suggested).reversed()));

        Integer share = null;
        if (salary != null && salary.typicalAmount() > 0 && !lines.isEmpty()) {
            double planned = lines.stream().mapToDouble(BudgetLine::suggested).sum();
            share = (int) Math.round(planned / salary.typicalAmount() * 100);
        }
        return new Draft(salary, lines, months.size(), round2(typicalTotal), share);
    }

    private static String reason(double typical, boolean essential, int months) {
        String basis = "Usually ₹" + String.format(Locale.ROOT, "%,d", Math.round(typical))
                + " a month (" + (months == 1 ? "last month" : "last " + months + " months") + ")";
        return essential ? basis + ". Kept as it is." : basis + ". Set 10% lower so more is left to save.";
    }

    /**
     * Months fully on record, newest first, up to {@link #MAX_MONTHS}: before
     * the current month, and not the first month on record if it starts late
     * (a 90-day SMS read starts mid-month, so that month looks cheaper than it was).
     */
    static List<YearMonth> completeMonths(List<Transaction> transactions, LocalDate today) {
        if (transactions.isEmpty()) return List.of();
        LocalDate first = transactions.stream().map(Transaction::getDate).min(LocalDate::compareTo).orElseThrow();
        YearMonth start = YearMonth.from(first);
        if (first.getDayOfMonth() > 5) start = start.plusMonths(1);
        Set<YearMonth> withData = transactions.stream().map(t -> YearMonth.from(t.getDate())).collect(Collectors.toSet());
        List<YearMonth> out = new ArrayList<>();
        for (YearMonth m = YearMonth.from(today).minusMonths(1); !m.isBefore(start) && out.size() < MAX_MONTHS; m = m.minusMonths(1)) {
            if (withData.contains(m)) out.add(m);
        }
        return out;
    }

    /** The salary, if one payer pays a steady amount around the same day each month. */
    public static Salary detectSalary(List<Transaction> transactions, LocalDate today) {
        LocalDate since = today.minusMonths(4).withDayOfMonth(1);
        Map<String, List<Transaction>> byPayer = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() == null || t.getAmount() < MIN_SALARY || t.getDate() == null) continue;
            if (t.getDate().isBefore(since) || TransactionMath.isSelfTransfer(t) || TransactionMath.isRefundLike(t.getMerchant())) continue;
            String payer = RecurringMath.normalizeMerchant(t.getMerchant());
            if (payer == null || payer.isBlank()) continue;
            byPayer.computeIfAbsent(payer, p -> new ArrayList<>()).add(t);
        }

        Salary best = null;
        for (List<Transaction> credits : byPayer.values()) {
            // The biggest credit of each month from this payer
            Map<YearMonth, Transaction> perMonth = new TreeMap<>();
            for (Transaction t : credits) {
                perMonth.merge(YearMonth.from(t.getDate()), t, (a, b) -> a.getAmount() >= b.getAmount() ? a : b);
            }
            if (perMonth.size() < 2) continue;
            List<Transaction> monthly = new ArrayList<>(perMonth.values());
            double typical = median(monthly.stream().mapToDouble(Transaction::getAmount).toArray());
            boolean steady = monthly.stream().allMatch(t -> Math.abs(t.getAmount() - typical) <= typical * SALARY_VARIATION);
            if (!steady) continue;
            int day = typicalDay(monthly.stream().map(Transaction::getDate).toList());
            boolean sameTime = monthly.stream().allMatch(t -> dayDistance(t.getDate().getDayOfMonth(), day) <= SALARY_DAY_DRIFT);
            if (!sameTime) continue;
            Transaction last = monthly.get(monthly.size() - 1);
            if (best == null || typical > best.typicalAmount()) {
                YearMonth nextMonth = YearMonth.from(last.getDate()).plusMonths(1);
                LocalDate next = nextMonth.atDay(Math.min(day, nextMonth.lengthOfMonth()));
                best = new Salary(clean(last.getMerchant()), round2(typical), day, monthly.size(), last.getDate(),
                        round2(last.getAmount()), next);
            }
        }
        return best;
    }

    /** The usual day of the month, treating the 30th and the 1st as neighbours. */
    static int typicalDay(List<LocalDate> dates) {
        int bestDay = dates.get(0).getDayOfMonth();
        int bestSpread = Integer.MAX_VALUE;
        for (LocalDate d : dates) {
            int candidate = d.getDayOfMonth();
            int spread = dates.stream().mapToInt(o -> dayDistance(o.getDayOfMonth(), candidate)).sum();
            if (spread < bestSpread) { bestSpread = spread; bestDay = candidate; }
        }
        return bestDay;
    }

    static int dayDistance(int a, int b) {
        int d = Math.abs(a - b);
        return Math.min(d, 31 - d);
    }

    private static String clean(String merchant) {
        if (merchant == null) return "Salary";
        String m = merchant.trim();
        return m.length() > 60 ? m.substring(0, 60) : m;
    }

    static double median(double[] values) {
        if (values.length == 0) return 0;
        double[] v = values.clone();
        Arrays.sort(v);
        int mid = v.length / 2;
        return v.length % 2 == 1 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
    }

    private static double roundUp(double v, int step) { return Math.ceil(v / step) * step; }
    private static double roundNearest(double v, int step) { return Math.max(step, Math.round(v / step) * step); }
    private static double round2(double v) { return Math.round(v * 100) / 100.0; }
}
