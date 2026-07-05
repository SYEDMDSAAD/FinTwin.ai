package com.fintwin.util;

/**
 * Shared goal feasibility math. GoalPlannerService and OnboardingService
 * previously used different health thresholds (150/100/70 vs 100/70/40) for
 * the same labels, so a goal could flip between "Excellent" and "On Track"
 * depending on which code path last touched it.
 */
public final class GoalMath {

    private GoalMath() {}

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
