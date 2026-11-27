package com.fintwin.util;

import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Investment;
import com.fintwin.model.SipPlan;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * The Plan tab: facts and goal maths, never a suggested mix. FinTwin isn't a
 * SEBI-registered adviser, and telling one person how to split their money
 * across asset types is itself investment advice, so this says what the
 * user's own numbers add up to and leaves the choice of what to buy to them.
 */
public final class InvestmentPlan {

    private InvestmentPlan() {}

    /** A common rule of thumb for an emergency fund, stated as such on screen. */
    public static final int EMERGENCY_MONTHS = 6;

    public record Goal(Long id, String title, double target, double saved, int monthsLeft,
                       double monthlyNeeded) {}

    public record Slice(String type, double value, double percent) {}

    public record Emergency(double saved, double monthsCovered, int targetMonths, double shortfall) {}

    public record Result(double monthlyIncome, double monthlySpend, double monthlySurplus,
                         Emergency emergency, List<Goal> goals, double goalsMonthlyNeeded,
                         double leftAfterGoals, double sipMonthly, double portfolioValue,
                         List<Slice> mix) {}

    public static Result build(double monthlyIncome, double monthlySpend, double liquidSavings,
                               List<FinancialGoal> goals, List<Investment> holdings,
                               List<SipPlan> sips, LocalDate today) {
        double surplus = monthlyIncome - monthlySpend;

        double saved = Math.max(0, liquidSavings);
        double covered = monthlySpend > 0 ? saved / monthlySpend : 0;
        double shortfall = monthlySpend > 0 ? Math.max(0, EMERGENCY_MONTHS * monthlySpend - saved) : 0;
        Emergency emergency = new Emergency(round(saved), Math.round(covered * 10) / 10.0,
                EMERGENCY_MONTHS, round(shortfall));

        List<Goal> open = new ArrayList<>();
        for (FinancialGoal g : goals) {
            if (Boolean.TRUE.equals(g.getCompleted())) continue;
            double target = nz(g.getTargetAmount());
            if (target <= 0) continue;
            double have = g.getExpectedSaved() != null ? g.getExpectedSaved() : nz(g.getCurrentSaved());
            int left = monthsLeft(g, today);
            double need = Math.max(0, target - have);
            open.add(new Goal(g.getId(), g.getTitle(), round(target), round(Math.min(have, target)), left,
                    round(need / Math.max(1, left))));
        }
        open.sort(Comparator.comparingInt(Goal::monthsLeft));
        double goalsNeed = open.stream().mapToDouble(Goal::monthlyNeeded).sum();

        double sipMonthly = sips.stream()
                .filter(s -> s.getAmount() != null)
                .mapToDouble(s -> s.getAmount().doubleValue() / ("Quarterly".equals(s.getFrequency()) ? 3 : 1))
                .sum();

        Map<String, Double> byType = new TreeMap<>();
        for (Investment i : holdings) {
            double v = i.getCurrentValue() != null ? i.getCurrentValue() : nz(i.getInvestedAmount());
            if (v <= 0) continue;
            byType.merge(i.getType() == null || i.getType().isBlank() ? "Other" : i.getType(), v, Double::sum);
        }
        double total = byType.values().stream().mapToDouble(Double::doubleValue).sum();
        List<Slice> mix = byType.entrySet().stream()
                .map(e -> new Slice(e.getKey(), round(e.getValue()), Math.round(e.getValue() / total * 1000) / 10.0))
                .sorted(Comparator.comparingDouble(Slice::value).reversed())
                .toList();

        return new Result(round(monthlyIncome), round(monthlySpend), round(surplus), emergency, open,
                round(goalsNeed), round(surplus - goalsNeed), round(sipMonthly), round(total), mix);
    }

    /** Months until the goal's deadline (created + duration), at least 1; 12 when no deadline is set. */
    static int monthsLeft(FinancialGoal g, LocalDate today) {
        if (g.getDurationMonths() == null || g.getDurationMonths() <= 0) return 12;
        LocalDate start = g.getCreatedAt() != null ? g.getCreatedAt() : today;
        LocalDate due = start.plusMonths(g.getDurationMonths());
        return (int) Math.max(1, ChronoUnit.MONTHS.between(today.withDayOfMonth(1), due.withDayOfMonth(1)));
    }

    private static double nz(Double d) { return d == null ? 0 : d; }

    private static double round(double d) { return Math.round(d * 100.0) / 100.0; }
}
