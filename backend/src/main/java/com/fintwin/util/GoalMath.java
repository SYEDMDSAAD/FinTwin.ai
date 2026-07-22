package com.fintwin.util;

import com.fintwin.model.FinancialGoal;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Shared goal feasibility math. GoalPlannerService and OnboardingService
 * previously used different health thresholds (150/100/70 vs 100/70/40) for
 * the same labels, so a goal could flip between "Excellent" and "On Track"
 * depending on which code path last touched it.
 */
public final class GoalMath {

    private GoalMath() {}

    /** Below this, residual pools and remaining needs count as zero rupees. */
    private static final double EPSILON = 0.01;

    /**
     * Splits each month's measured savings across the goals that were active
     * that month, returning total allocated per goal id.
     *
     * Progress used to be extrapolated (months elapsed x the *current* savings
     * rate), which let one bad month rewrite all past progress, and every goal
     * counted the same savings in full. Here each month's pool is real money
     * (from {@link TransactionMath#netSavingsByMonth}) and is divided
     * proportionally to each active goal's monthlyTarget, so a rupee lands on
     * exactly one goal.
     *
     * Rules per month:
     * - A goal accrues from its creation month through its completion month
     *   (null createdAt: only the current month; null completedAt: still open).
     * - Overspent months contribute nothing and take nothing back.
     * - A goal never takes more than it still needs; the excess re-splits among
     *   the goals still short (water-fill), and money left after every goal is
     *   full stays unallocated.
     */
    public static Map<Long, Double> allocateSavings(
            List<FinancialGoal> goals,
            Map<YearMonth, Double> netSavingsByMonth,
            YearMonth currentMonth) {

        Map<Long, Double> allocated = new HashMap<>();
        YearMonth start = null;
        for (FinancialGoal g : goals) {
            allocated.put(g.getId(), 0.0);
            if (g.getCreatedAt() == null) continue;
            YearMonth created = YearMonth.from(g.getCreatedAt());
            if (start == null || created.isBefore(start)) start = created;
        }
        if (start == null || start.isAfter(currentMonth)) start = currentMonth;

        for (YearMonth month = start; !month.isAfter(currentMonth);
                month = month.plusMonths(1)) {

            double pool = Math.max(0.0, netSavingsByMonth.getOrDefault(month, 0.0));

            while (pool > EPSILON) {
                List<FinancialGoal> open = new ArrayList<>();
                double weightSum = 0.0;
                for (FinancialGoal g : goals) {
                    if (!accruesIn(g, month, currentMonth)) continue;
                    double target = g.getTargetAmount() != null ? g.getTargetAmount() : 0.0;
                    double weight = g.getMonthlyTarget() != null ? g.getMonthlyTarget() : 0.0;
                    if (weight <= 0 || target - allocated.get(g.getId()) <= EPSILON) continue;
                    open.add(g);
                    weightSum += weight;
                }
                if (open.isEmpty()) break;

                double distributed = 0.0;
                for (FinancialGoal g : open) {
                    double share = pool * (g.getMonthlyTarget() / weightSum);
                    double need = g.getTargetAmount() - allocated.get(g.getId());
                    double take = Math.min(share, need);
                    allocated.merge(g.getId(), take, Double::sum);
                    distributed += take;
                }
                pool -= distributed;
                if (distributed <= EPSILON) break;
            }
        }
        return allocated;
    }

    private static boolean accruesIn(FinancialGoal goal, YearMonth month,
                                     YearMonth currentMonth) {
        YearMonth from = goal.getCreatedAt() != null
                ? YearMonth.from(goal.getCreatedAt()) : currentMonth;
        if (month.isBefore(from)) return false;
        return goal.getCompletedAt() == null
                || !month.isAfter(YearMonth.from(goal.getCompletedAt()));
    }

    /**
     * Coverage of the monthly target by monthly savings, as a percentage
     * capped to [0, 100]. Not a statistical probability — it answers "does
     * current saving capacity cover the required monthly amount".
     */
    public static double successProbability(double monthlySavings, double monthlyTarget) {
        if (monthlyTarget <= 0) return 50.0;
        return Math.min(100.0, Math.max(0.0, (monthlySavings / monthlyTarget) * 100));
    }

    /**
     * Health from the uncapped coverage ratio: 50% headroom is Excellent,
     * full coverage On Track, 70%+ At Risk, below that Critical.
     */
    public static String health(double monthlySavings, double monthlyTarget) {
        if (monthlyTarget <= 0) return "On Track";
        double coverage = (monthlySavings / monthlyTarget) * 100;
        if (coverage >= 150) return "Excellent";
        if (coverage >= 100) return "On Track";
        if (coverage >= 70)  return "At Risk";
        return "Critical";
    }
}
