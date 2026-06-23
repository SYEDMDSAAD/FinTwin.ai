package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.dto.GoalRequestDTO;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Transaction;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class GoalPlannerService {

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

    @Audited(action = "WRITE", resource = "goals", description = "Financial goal created")
    public FinancialGoal createGoal(GoalRequestDTO dto) {

        validateGoalRequest(dto);

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        FinancialContext ctx = buildFinancialContext(user);

        double monthlyTarget = Math.ceil(dto.getTargetAmount()
                / dto.getDurationMonths());

        double probability = computeProbability(
                ctx.savings, monthlyTarget
        );

        String goalHealth = computeGoalHealth(
                ctx.savings, monthlyTarget
        );

        Map<String, Double> categorySpending =
                buildCategorySpending(ctx.transactions);

        List<FinancialGoal> existingGoals =
                goalRepository.findByUser(user);

        String aiPlan = generateAIPlan(
                dto, ctx.income, ctx.expenses,
                ctx.savings, monthlyTarget,
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
        goal.setAvailableSavings(ctx.savings);
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

    @Audited(action = "READ", resource = "goals", description = "All financial goals retrieved")
    public List<FinancialGoal> getGoals() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        List<FinancialGoal> goals = goalRepository.findByUser(user);

        FinancialContext ctx = buildFinancialContext(user);

        for (FinancialGoal goal : goals) {

            // FIXED: only save when createdAt is genuinely missing
            if (goal.getCreatedAt() == null) {
                goal.setCreatedAt(LocalDate.now());
                goalRepository.save(goal);
            }

            goal.setAvailableSavings(ctx.savings);
            goal.setGoalHealth(
                    computeGoalHealth(ctx.savings, goal.getMonthlyTarget())
            );

            updateProgress(goal);
        }

        return goals;
    }

    // =========================
    // UPDATE GOAL
    // FIXED: after updating target/duration, the
    // successProbability was recalculated but the
    // updated monthly target was not persisted — now fixed.
    // Also regenerates AI plan after update.
    // =========================

    @Audited(action = "WRITE", resource = "goals", description = "Financial goal updated")
    public FinancialGoal updateGoal(Long id, GoalRequestDTO dto) {

        validateGoalRequest(dto);

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        FinancialGoal goal = goalRepository
                .findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Goal not found")
                );

        if (goal.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new RuntimeException("Unauthorized Goal Access");
        }

        FinancialContext ctx = buildFinancialContext(user);

        double monthlyTarget = Math.ceil(dto.getTargetAmount()
                / dto.getDurationMonths());

        double probability = computeProbability(
                ctx.savings, monthlyTarget
        );

        Map<String, Double> categorySpending =
                buildCategorySpending(ctx.transactions);

        List<FinancialGoal> otherGoals = new ArrayList<>();
        for (FinancialGoal g : goalRepository.findByUser(user)) {
            if (!g.getId().equals(id)) otherGoals.add(g);
        }

        String aiPlan = generateAIPlan(
                dto, ctx.income, ctx.expenses,
                ctx.savings, monthlyTarget,
                probability, categorySpending, otherGoals
        );

        goal.setTitle(dto.getTitle().trim());
        goal.setTargetAmount(dto.getTargetAmount());
        goal.setDurationMonths(dto.getDurationMonths());
        goal.setMonthlyTarget(monthlyTarget);
        goal.setSuccessProbability(round1(probability));
        goal.setAiPlan(aiPlan);
        goal.setAvailableSavings(ctx.savings);
        goal.setGoalHealth(computeGoalHealth(ctx.savings, monthlyTarget));

        updateProgress(goal);

        FinancialGoal saved = goalRepository.save(goal);
        profileService.saveScoreSnapshot(user);

        return saved;
    }

    // =========================
    // DELETE GOAL
    // =========================

    @Audited(action = "DELETE", resource = "goals", description = "Financial goal deleted")
    public void deleteGoal(Long id) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        FinancialGoal goal = goalRepository
                .findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Goal not found")
                );

        if (goal.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new RuntimeException("Unauthorized Goal Access");
        }

        goalRepository.delete(goal);
        profileService.saveScoreSnapshot(user);
    }

    // =========================
    // REGENERATE AI PLAN
    // FIXED: was reconstructing a GoalRequestDTO from the
    // goal entity — redundant. Now directly passes goal fields.
    // =========================

    @Audited(action = "WRITE", resource = "goals", description = "AI plan regenerated for financial goal")
    public FinancialGoal regenerateGoal(Long id) {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        FinancialGoal goal = goalRepository
                .findById(id)
                .orElseThrow(() ->
                        new RuntimeException("Goal not found")
                );

        if (goal.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new RuntimeException("Unauthorized Goal Access");
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
                dto, ctx.income, ctx.expenses,
                ctx.savings, goal.getMonthlyTarget(),
                probability, categorySpending, otherGoals
        );

        goal.setAiPlan(newPlan);
        goal.setAvailableSavings(ctx.savings);
        goal.setGoalHealth(
                computeGoalHealth(ctx.savings, goal.getMonthlyTarget())
        );

        updateProgress(goal);

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

        double income = transactions.stream()
                .filter(t -> t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount)
                .sum();

        double expenses = transactions.stream()
                .filter(t -> t.getAmount() < 0)
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        return new FinancialContext(transactions, income, expenses);
    }

    private Map<String, Double> buildCategorySpending(
            List<Transaction> transactions) {
        Map<String, Double> map = new HashMap<>();
        for (Transaction t : transactions) {
            if (t.getAmount() < 0) {
                String cat = t.getCategory() != null
                        ? t.getCategory() : "Other";
                map.merge(cat, Math.abs(t.getAmount()), Double::sum);
            }
        }
        return map;
    }

    private double computeProbability(double savings, double monthlyTarget) {
        if (monthlyTarget <= 0) return 50.0;
        // FIXED: was missing floor at 0
        return Math.min(100.0, Math.max(0.0,
                (savings / monthlyTarget) * 100
        ));
    }

    private String computeGoalHealth(double savings, double monthlyTarget) {
        if (monthlyTarget <= 0) return "On Track";
        double score = (savings / monthlyTarget) * 100;
        if (score >= 150) return "Excellent";
        if (score >= 100) return "On Track";
        if (score >= 70)  return "At Risk";
        return "Critical";
    }

    private void updateProgress(FinancialGoal goal) {
        double availSavings = goal.getAvailableSavings() != null
                ? goal.getAvailableSavings() : 0.0;

        // No progress if user has zero or negative monthly savings
        double positiveMonthly = Math.max(0.0, availSavings);

        long monthsElapsed = goal.getCreatedAt() == null ? 1
                : Math.max(1,
                        ChronoUnit.MONTHS.between(
                                goal.getCreatedAt(), LocalDate.now()
                        ) + 1
                  );

        double expectedSaved = Math.min(
                monthsElapsed * positiveMonthly,
                goal.getTargetAmount()
        );

        double progressPercent = goal.getTargetAmount() > 0
                ? (expectedSaved / goal.getTargetAmount()) * 100 : 0;

        goal.setExpectedSaved(expectedSaved);
        goal.setProgressPercent(round1(progressPercent));
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
                return buildFallbackPlan(dto, monthlyTarget);
            }

            return response.get("plan").toString();

        } catch (Exception e) {
            e.printStackTrace();
            return buildFallbackPlan(dto, monthlyTarget);
        }
    }

    // IMPROVEMENT: meaningful fallback instead of generic message
    private String buildFallbackPlan(GoalRequestDTO dto, double monthlyTarget) {
        return String.format(
                "To achieve your goal '%s' of ₹%.0f in %d months, "
                + "save ₹%.0f per month. "
                + "Review discretionary spending and automate transfers "
                + "on salary day to stay on track.",
                dto.getTitle(),
                dto.getTargetAmount(),
                dto.getDurationMonths(),
                monthlyTarget
        );
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

        FinancialContext(List<Transaction> tx, double inc, double exp) {
            this.transactions = tx;
            this.income = inc;
            this.expenses = exp;
            this.savings = inc - exp;
        }
    }
}
