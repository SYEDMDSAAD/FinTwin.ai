package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.exception.ConflictException;
import com.fintwin.exception.ForbiddenException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.dto.GoalRequestDTO;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.util.*;

@Service
public class GoalPlannerService {

    private static final Logger log = LoggerFactory.getLogger(GoalPlannerService.class);

    @Autowired
    private FinancialGoalRepository goalRepository;

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private ProfileService profileService;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    // =========================
    // CREATE GOAL
    // FIXED: durationMonths division had no zero-guard —
    // throws ArithmeticException if 0 is passed.
    // IMPROVEMENT: validation added, probability capped
    // at 100 and floored at 0.
    // =========================

    @PreAuthorize("hasAuthority('WRITE_OWN_GOALS')")
    @Audited(action = "WRITE", resource = "goals", description = "Financial goal created")
    public FinancialGoal createGoal(GoalRequestDTO dto) {

        validateGoalRequest(dto);

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        FinancialContext ctx = buildFinancialContext(user);

        double monthlyTarget = Math.ceil(dto.getTargetAmount()
                / dto.getDurationMonths());

        double probability = computeProbability(
                ctx.monthlySavings, monthlyTarget
        );

        String goalHealth = computeGoalHealth(
                ctx.monthlySavings, monthlyTarget
        );

        Map<String, Double> categorySpending =
                buildCategorySpending(ctx.transactions);

        List<FinancialGoal> existingGoals =
                goalRepository.findByUser(user);

        String aiPlan = generateAIPlan(
                dto, ctx.monthlyIncome, ctx.monthlyExpenses,
                ctx.monthlySavings, monthlyTarget,
                probability, categorySpending, existingGoals
        );

        FinancialGoal goal = new FinancialGoal();
        goal.setTitle(dto.getTitle().trim());
        goal.setTargetAmount(dto.getTargetAmount());
        goal.setDurationMonths(dto.getDurationMonths());
        goal.setCurrentSaved(0.0);
        goal.setMonthlyTarget(monthlyTarget);
        goal.setSuccessProbability(round1(probability));
        goal.setAiPlan(aiPlan);
        goal.setUser(user);
        goal.setAvailableSavings(ctx.monthlySavings);
        goal.setGoalHealth(goalHealth);
        goal.setCreatedAt(LocalDate.now());
        goal.setExpectedSaved(0.0);
        goal.setProgressPercent(0.0);

        FinancialGoal saved = goalRepository.save(goal);
        profileService.saveScoreSnapshot(user);

        return saved;
    }

    // =========================
    // GET ALL GOALS
    // FIXED: was calling goalRepository.save() inside the
    // read loop to patch missing createdAt. That causes
    // unnecessary write per goal on every GET — moved to
    // a targeted fix only when createdAt is actually null.
    // IMPROVEMENT: progress is computed from months elapsed
    // vs. total duration, capped at 100%.
    // =========================

    @PreAuthorize("hasAuthority('READ_OWN_GOALS')")
    @Audited(action = "READ", resource = "goals", description = "All financial goals retrieved")
    public List<FinancialGoal> getGoals() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        return getGoalsForUser(user);
    }

    // Recalculated goals for an explicit user — progress/health/expectedSaved are
    // computed in-memory on every fetch and never persisted, so any consumer that
    // reads the repository directly (e.g. the internal AI data API) gets stale
    // zeros. Service-to-service callers use this; getGoals() keeps the
    // security-context resolution and authorization on the public path.
    public List<FinancialGoal> getGoalsForUser(User user) {

        List<FinancialGoal> goals = goalRepository.findByUser(user);

        FinancialContext ctx = buildFinancialContext(user);

        for (FinancialGoal goal : goals) {

            // FIXED: only save when createdAt is genuinely missing
            if (goal.getCreatedAt() == null) {
                goal.setCreatedAt(LocalDate.now());
                goalRepository.save(goal);
            }

            goal.setAvailableSavings(ctx.monthlySavings);
            goal.setGoalHealth(
                    computeGoalHealth(ctx.monthlySavings, goal.getMonthlyTarget())
            );
        }

        recomputeProgress(user, goals);

        return goals;
    }

    // =========================
    // UPDATE GOAL
    // FIXED: after updating target/duration, the
    // successProbability was recalculated but the
    // updated monthly target was not persisted — now fixed.
    // Also regenerates AI plan after update.
    // =========================

    @PreAuthorize("hasAuthority('WRITE_OWN_GOALS')")
    @Audited(action = "WRITE", resource = "goals", description = "Financial goal updated")
    public FinancialGoal updateGoal(Long id, GoalRequestDTO dto) {

        validateGoalRequest(dto);

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        FinancialGoal goal = goalRepository
                .findById(id)
                .orElseThrow(() ->
                        new NotFoundException("Goal not found")
                );

        if (goal.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new ForbiddenException("Unauthorized Goal Access");
        }

        FinancialContext ctx = buildFinancialContext(user);

        double monthlyTarget = Math.ceil(dto.getTargetAmount()
                / dto.getDurationMonths());

        double probability = computeProbability(
                ctx.monthlySavings, monthlyTarget
        );

        Map<String, Double> categorySpending =
                buildCategorySpending(ctx.transactions);

        List<FinancialGoal> otherGoals = new ArrayList<>();
        for (FinancialGoal g : goalRepository.findByUser(user)) {
            if (!g.getId().equals(id)) otherGoals.add(g);
        }

        String aiPlan = generateAIPlan(
                dto, ctx.monthlyIncome, ctx.monthlyExpenses,
                ctx.monthlySavings, monthlyTarget,
                probability, categorySpending, otherGoals
        );

        goal.setTitle(dto.getTitle().trim());
        goal.setTargetAmount(dto.getTargetAmount());
        goal.setDurationMonths(dto.getDurationMonths());
        goal.setMonthlyTarget(monthlyTarget);
        goal.setSuccessProbability(round1(probability));
        goal.setAiPlan(aiPlan);
        goal.setAvailableSavings(ctx.monthlySavings);
        goal.setGoalHealth(computeGoalHealth(ctx.monthlySavings, monthlyTarget));

        recomputeProgressFor(user, goal);

        FinancialGoal saved = goalRepository.save(goal);
        profileService.saveScoreSnapshot(user);

        return saved;
    }

    // =========================
    // DELETE GOAL
    // =========================

    @PreAuthorize("hasAuthority('WRITE_OWN_GOALS')")
    @Audited(action = "DELETE", resource = "goals", description = "Financial goal deleted")
    public void deleteGoal(Long id) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        FinancialGoal goal = goalRepository
                .findById(id)
                .orElseThrow(() ->
                        new NotFoundException("Goal not found")
                );

        if (goal.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new ForbiddenException("Unauthorized Goal Access");
        }

        goalRepository.delete(goal);
        profileService.saveScoreSnapshot(user);
    }

    // =========================
    // MARK GOAL COMPLETE
    // Only allowed once progress has genuinely reached 100% — recomputed here
    // rather than trusting the possibly-stale stored value, since getGoals()
    // recalculates progress in-memory on every fetch without persisting it.
    // =========================

    @PreAuthorize("hasAuthority('WRITE_OWN_GOALS')")
    @Audited(action = "WRITE", resource = "goals", description = "Financial goal marked complete")
    public FinancialGoal completeGoal(Long id) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        FinancialGoal goal = goalRepository
                .findById(id)
                .orElseThrow(() ->
                        new NotFoundException("Goal not found")
                );

        if (goal.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new ForbiddenException("Unauthorized Goal Access");
        }

        if (Boolean.TRUE.equals(goal.getCompleted())) {
            return goal;
        }

        FinancialContext ctx = buildFinancialContext(user);
        goal.setAvailableSavings(ctx.monthlySavings);
        recomputeProgressFor(user, goal);

        if (goal.getProgressPercent() == null || goal.getProgressPercent() < 100) {
            throw new ConflictException("Goal has not yet reached 100% progress.");
        }

        goal.setCompleted(true);
        goal.setCompletedAt(LocalDate.now());

        FinancialGoal saved = goalRepository.save(goal);
        profileService.saveScoreSnapshot(user);

        return saved;
    }

    // =========================
    // REGENERATE AI PLAN
    // FIXED: was reconstructing a GoalRequestDTO from the
    // goal entity — redundant. Now directly passes goal fields.
    // =========================

    @PreAuthorize("hasAuthority('WRITE_OWN_GOALS')")
    @Audited(action = "WRITE", resource = "goals", description = "AI plan regenerated for financial goal")
    public FinancialGoal regenerateGoal(Long id) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new NotFoundException("User not found")
                );

        FinancialGoal goal = goalRepository
                .findById(id)
                .orElseThrow(() ->
                        new NotFoundException("Goal not found")
                );

        if (goal.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new ForbiddenException("Unauthorized Goal Access");
        }

        FinancialContext ctx = buildFinancialContext(user);

        Map<String, Double> categorySpending =
                buildCategorySpending(ctx.transactions);

        GoalRequestDTO dto = new GoalRequestDTO();
        dto.setTitle(goal.getTitle());
        dto.setTargetAmount(goal.getTargetAmount());
        dto.setDurationMonths(goal.getDurationMonths());

        double probability = goal.getSuccessProbability() != null
                ? goal.getSuccessProbability() : 0.0;

        List<FinancialGoal> otherGoals = new ArrayList<>();
        for (FinancialGoal g : goalRepository.findByUser(user)) {
            if (!g.getId().equals(id)) otherGoals.add(g);
        }

        String newPlan = generateAIPlan(
                dto, ctx.monthlyIncome, ctx.monthlyExpenses,
                ctx.monthlySavings, goal.getMonthlyTarget(),
                probability, categorySpending, otherGoals
        );

        goal.setAiPlan(newPlan);
        goal.setAvailableSavings(ctx.monthlySavings);
        goal.setGoalHealth(
                computeGoalHealth(ctx.monthlySavings, goal.getMonthlyTarget())
        );

        recomputeProgressFor(user, goal);

        FinancialGoal saved = goalRepository.save(goal);
        profileService.saveScoreSnapshot(user);

        return saved;
    }

    // =========================
    // PRIVATE HELPERS
    // =========================

    private void validateGoalRequest(GoalRequestDTO dto) {
        if (dto.getTitle() == null || dto.getTitle().isBlank()) {
            throw new IllegalArgumentException(
                    "Goal title must not be empty"
            );
        }
        if (dto.getTargetAmount() == null || dto.getTargetAmount() <= 0) {
            throw new IllegalArgumentException(
                    "Target amount must be greater than 0"
            );
        }
        // FIXED: zero division guard
        if (dto.getDurationMonths() == null || dto.getDurationMonths() <= 0) {
            throw new IllegalArgumentException(
                    "Duration must be at least 1 month"
            );
        }
    }

    private FinancialContext buildFinancialContext(User user) {
        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        double income   = com.fintwin.util.TransactionMath.income(transactions);
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions);

        return new FinancialContext(transactions, income, expenses);
    }

    private Map<String, Double> buildCategorySpending(
            List<Transaction> transactions) {
        Map<String, Double> map = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() != null && t.getAmount() < 0) {
                String cat = t.getCategory() != null
                        ? t.getCategory() : "Other";
                map.merge(cat, Math.abs(t.getAmount()), Double::sum);
            }
        }
        return map;
    }

    private double computeProbability(double monthlySavings, double monthlyTarget) {
        return com.fintwin.util.GoalMath.successProbability(monthlySavings, monthlyTarget);
    }

    private String computeGoalHealth(double monthlySavings, double monthlyTarget) {
        return com.fintwin.util.GoalMath.health(monthlySavings, monthlyTarget);
    }

    // =========================
    // PROGRESS (measured, allocated)
    // REWORKED: progress used to be monthsElapsed x the *current* monthly
    // savings rate — extrapolation that rewrote past progress whenever the
    // rate moved, and let every goal claim the same savings in full. Now each
    // month since the earliest goal is measured from actual transactions and
    // split across the goals active that month (GoalMath.allocateSavings), so
    // a rupee counts toward exactly one goal.
    // =========================

    private void recomputeProgress(User user, List<FinancialGoal> goals) {
        if (goals.isEmpty()) return;

        LocalDate earliest = LocalDate.now();
        for (FinancialGoal g : goals) {
            if (g.getCreatedAt() != null && g.getCreatedAt().isBefore(earliest)) {
                earliest = g.getCreatedAt();
            }
        }

        // Goal windows outgrow the 3-month default; same query, wider cutoff.
        // Amounts are encrypted at rest, so aggregation happens here, not in SQL.
        List<Transaction> transactions = transactionRepository
                .findLatestThreeMonthsTransactions(
                        user.getId(), earliest.withDayOfMonth(1));

        Map<Long, Double> allocated = com.fintwin.util.GoalMath.allocateSavings(
                goals,
                com.fintwin.util.TransactionMath.netSavingsByMonth(transactions),
                java.time.YearMonth.now()
        );

        for (FinancialGoal goal : goals) {
            applyProgress(goal, allocated.getOrDefault(goal.getId(), 0.0));
        }
    }

    // Allocation is cross-goal, so recomputing one goal still needs the whole
    // set. The caller's (possibly modified, not yet saved) instance replaces
    // its stored counterpart — repository calls outside a shared transaction
    // return a different instance for the same row.
    private void recomputeProgressFor(User user, FinancialGoal goal) {
        List<FinancialGoal> goals = new ArrayList<>();
        goals.add(goal);
        for (FinancialGoal g : goalRepository.findByUser(user)) {
            if (!Objects.equals(g.getId(), goal.getId())) goals.add(g);
        }
        recomputeProgress(user, goals);
    }

    private void applyProgress(FinancialGoal goal, double allocatedSaved) {
        // A completed goal passed the 100% gate; data drift afterwards must
        // not un-complete it on screen.
        if (Boolean.TRUE.equals(goal.getCompleted())) {
            goal.setExpectedSaved(goal.getTargetAmount());
            goal.setProgressPercent(100.0);
            return;
        }

        double target = goal.getTargetAmount() != null ? goal.getTargetAmount() : 0.0;
        double saved = Math.min(allocatedSaved, target);

        goal.setExpectedSaved(saved);
        goal.setProgressPercent(round1(
                target > 0 ? (saved / target) * 100 : 0.0));
    }

    private String generateAIPlan(
            GoalRequestDTO dto,
            double income,
            double expenses,
            double savings,
            double monthlyTarget,
            double probability,
            Map<String, Double> categorySpending,
            List<FinancialGoal> otherGoals
    ) {
        try {
            List<Map<String, Object>> otherGoalsList = new ArrayList<>();
            for (FinancialGoal g : otherGoals) {
                Map<String, Object> gm = new HashMap<>();
                gm.put("title", g.getTitle());
                gm.put("targetAmount", g.getTargetAmount());
                gm.put("durationMonths", g.getDurationMonths());
                gm.put("monthlyTarget", g.getMonthlyTarget());
                otherGoalsList.add(gm);
            }

            Map<String, Object> body = new HashMap<>();
            body.put("title", dto.getTitle());
            body.put("targetAmount", dto.getTargetAmount());
            body.put("durationMonths", dto.getDurationMonths());
            body.put("income", income);
            body.put("expenses", expenses);
            body.put("savings", savings);
            body.put("monthlyTarget", monthlyTarget);
            body.put("successProbability", probability);
            body.put("categorySpending", categorySpending);
            body.put("otherGoals", otherGoalsList);

            Map response = aiRestTemplate.postForObject(
                    aiServiceUrl + "/goal-plan",
                    body,
                    Map.class
            );

            if (response == null || response.get("plan") == null) {
                return buildFallbackPlan(dto, monthlyTarget, savings);
            }

            return response.get("plan").toString();

        } catch (Exception e) {
            log.warn("AI goal-plan generation failed, using fallback plan", e);
            return buildFallbackPlan(dto, monthlyTarget, savings);
        }
    }

    /**
     * The plan shown when the AI service itself is unreachable — a different
     * failure from the model misbehaving, which the AI service already handles
     * with its own grounded fallback.
     *
     * Written in the same markdown section skeleton the AI service emits
     * (headline, "Do this now", "Milestones", "Biggest risk") because this
     * string is persisted on the goal and rendered by the same card: a bare
     * sentence where every other goal shows a structured plan reads as a bug,
     * and stays on the goal until someone regenerates it.
     */
    private String buildFallbackPlan(GoalRequestDTO dto, double monthlyTarget,
                                     double monthlySavings) {

        double target = dto.getTargetAmount();
        int months = dto.getDurationMonths();
        double gap = Math.max(0, monthlyTarget - monthlySavings);

        StringBuilder plan = new StringBuilder();

        plan.append(gap > 0
                ? String.format(
                        "Reaching this goal on time needs %s a month, which is %s more "
                        + "than you currently save.",
                        rupees(monthlyTarget), rupees(gap))
                : String.format(
                        "Your current saving of %s a month already covers this goal.",
                        rupees(monthlySavings)));

        plan.append("\n\n### Do this now\n");
        plan.append(String.format(
                "- Automate a %s transfer on salary day so the goal is funded before "
                + "anything else is spent.\n", rupees(monthlyTarget)));
        if (gap > 0 && monthlySavings > 0) {
            // Ceiling division: the last, partial month still has to be saved.
            long realisticMonths = (long) Math.ceil(target / monthlySavings);
            plan.append(String.format(
                    "- Or hold your current %s a month and accept %d months instead "
                    + "of %d.\n", rupees(monthlySavings), realisticMonths, months));
        } else {
            plan.append("- Review your discretionary spending for the difference "
                    + "before the next salary date.\n");
        }

        plan.append("\n### Milestones\n");
        for (int mark : milestoneMarks(months)) {
            double cumulative = Math.min(monthlyTarget * mark, target);
            long share = target > 0 ? Math.round(cumulative / target * 100) : 0;
            plan.append(String.format("- Month %d — %s saved (%d%%)\n",
                    mark, rupees(cumulative), share));
        }

        plan.append("\n### Biggest risk\n");
        plan.append(gap > 0
                ? String.format("- The most likely failure is treating the %s gap as "
                        + "something next month will fix.", rupees(gap))
                : "- The most likely failure is drift — letting spending rise to meet "
                        + "the surplus until the transfer stops clearing.");

        return plan.toString();
    }

    /** Quarter-point checkpoints plus the finish line, deduplicated. */
    private List<Integer> milestoneMarks(int months) {
        Set<Integer> marks = new TreeSet<>();
        for (double fraction : new double[]{0.25, 0.5, 0.75}) {
            marks.add(Math.max(1, (int) Math.round(months * fraction)));
        }
        marks.add(months);
        return new ArrayList<>(marks);
    }

    /** Indian digit grouping — ₹1,50,000, matching what the card renders. */
    private String rupees(double value) {
        return "₹" + java.text.NumberFormat
                .getIntegerInstance(Locale.forLanguageTag("en-IN"))
                .format(Math.round(value));
    }

    private double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    // Inner class to bundle financial context
    private static class FinancialContext {
        final List<Transaction> transactions;
        final double income;
        final double expenses;
        final double savings;
        // Per-month figures over the months actually present in the window.
        // Goal targets are monthly, and the ai-service labels these values
        // "Monthly income/expenses/savings" in its prompts — multi-month
        // totals overstated everything ~3x.
        final double monthlyIncome;
        final double monthlyExpenses;
        final double monthlySavings;

        FinancialContext(List<Transaction> tx, double inc, double exp) {
            this.transactions = tx;
            this.income = inc;
            this.expenses = exp;
            this.savings = inc - exp;
            int months = com.fintwin.util.TransactionMath.monthsPresent(tx);
            this.monthlyIncome   = inc / months;
            this.monthlyExpenses = exp / months;
            this.monthlySavings  = this.savings / months;
        }
    }
}
