package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.dto.OnboardingRequestDTO;
import com.fintwin.model.Asset;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Liability;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.AssetRepository;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.LiabilityRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

@Service
public class OnboardingService {

    // Expense breakdown — fractions must sum to 1.0
    private static final Object[][] EXPENSE_TEMPLATE = {
        // { dayOfMonth, merchant, category, fraction }
        {  2, "Rent",          "Housing",       0.35 },
        {  5, "Zomato",        "Food",          0.08 },
        {  7, "Swiggy",        "Food",          0.07 },
        {  9, "BigBasket",     "Food",          0.05 },
        { 11, "Uber",          "Travel",        0.05 },
        { 13, "Electricity",   "Bills",         0.08 },
        { 16, "Netflix",       "Entertainment", 0.03 },
        { 19, "Amazon",        "Shopping",      0.10 },
        { 23, "Medical",       "Healthcare",    0.04 },
        { 26, "Fuel",          "Travel",        0.05 },
        { 28, "Miscellaneous", "Others",        0.10 },
    };

    private final UserRepository            userRepository;
    private final AssetRepository           assetRepository;
    private final LiabilityRepository       liabilityRepository;
    private final FinancialGoalRepository   goalRepository;
    private final TransactionRepository     transactionRepository;

    public OnboardingService(
            UserRepository userRepository,
            AssetRepository assetRepository,
            LiabilityRepository liabilityRepository,
            FinancialGoalRepository goalRepository,
            TransactionRepository transactionRepository) {
        this.userRepository       = userRepository;
        this.assetRepository      = assetRepository;
        this.liabilityRepository  = liabilityRepository;
        this.goalRepository       = goalRepository;
        this.transactionRepository = transactionRepository;
    }

    @Audited(action = "WRITE", resource = "profile", description = "User completed onboarding setup")
    @Transactional
    public void completeSetup(OnboardingRequestDTO request) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();

        // Clear previous onboarding data
        goalRepository.deleteByUser(user);
        assetRepository.deleteByUser(user);
        liabilityRepository.deleteByUser(user);

        // Savings asset
        if (request.getSavings() > 0) {
            Asset savings = new Asset();
            savings.setName("Manual Savings");
            savings.setType("ManualSavings");
            savings.setAmount(request.getSavings());
            savings.setUser(user);
            assetRepository.save(savings);
        }

        // Investment portfolio
        if (request.getInvestments() > 0) {
            Asset inv = new Asset();
            inv.setName("Investment Portfolio");
            inv.setType("Investment");
            inv.setAmount(request.getInvestments());
            inv.setUser(user);
            assetRepository.save(inv);
        }

        // Liabilities
        if (request.getDebt() > 0) {
            Liability liability = new Liability();
            liability.setName("Existing Debt");
            liability.setType("Loan");
            liability.setAmount(request.getDebt());
            liability.setUser(user);
            liabilityRepository.save(liability);
        }

        // Goals
        List<String> goals = request.getGoals();
        if (goals != null) {
            for (String title : goals) {
                goalRepository.save(buildGoal(title, request, user));
            }
        }

        // Manual path: seed 6 months of synthetic transactions so the dashboard
        // has meaningful data from day 1. Bank-connect path skips this — real
        // transactions arrive via the Setu AA webhook.
        boolean isManualPath = request.getIncomeLast3Months() != null
                && request.getIncomeLast3Months() > 0;
        if (isManualPath) {
            transactionRepository.deleteByUser(user);
            seedTransactions(request, user);
        }

        user.setOnboardingCompleted(true);
        userRepository.save(user);
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private void seedTransactions(OnboardingRequestDTO request, User user) {
        double curIncome   = request.getIncomeLast3Months();
        double curExpenses = request.getExpensesLast3Months();

        double prevIncome   = curIncome   * 0.90;
        double prevExpenses = curExpenses * 1.20;

        double[] distribution = { 0.32, 0.28, 0.40 };

        LocalDate today = LocalDate.now();
        int startOffset = today.getDayOfMonth() >= 10 ? 5 : 6;

        List<Transaction> batch = new ArrayList<>(80);

        for (int i = 0; i < 6; i++) {
            boolean isPrevQuarter = i < 3;
            double quarterly = isPrevQuarter ? prevIncome   : curIncome;
            double qExpenses = isPrevQuarter ? prevExpenses : curExpenses;
            int    qIndex    = i % 3;

            double monthIncome   = quarterly * distribution[qIndex];
            double monthExpenses = qExpenses  * distribution[qIndex];

            LocalDate month = today.minusMonths(startOffset - i);

            batch.add(buildTransaction(user, month.withDayOfMonth(1).toString(), "Employer", monthIncome, "Income"));

            for (Object[] row : EXPENSE_TEMPLATE) {
                int    day      = (int)    row[0];
                String merchant = (String) row[1];
                String category = (String) row[2];
                double fraction = (double) row[3];

                LocalDate txDate = month.withDayOfMonth(day);
                if (!txDate.isAfter(today)) {
                    batch.add(buildTransaction(user, txDate.toString(), merchant, -(monthExpenses * fraction), category));
                }
            }
        }

        transactionRepository.saveAll(batch);
    }

    private FinancialGoal buildGoal(String title, OnboardingRequestDTO req, User user) {
        double targetAmount;
        int durationMonths;

        switch (title) {
            case "Emergency Fund" -> { targetAmount = 150_000.0;    durationMonths = 12;  }
            case "Travel"         -> { targetAmount = 100_000.0;    durationMonths = 12;  }
            case "Buy a Car"      -> { targetAmount = 800_000.0;    durationMonths = 36;  }
            case "House"          -> { targetAmount = 2_000_000.0;  durationMonths = 120; }
            case "Education"      -> { targetAmount = 500_000.0;    durationMonths = 48;  }
            case "Retirement"     -> { targetAmount = 10_000_000.0; durationMonths = 240; }
            default               -> { targetAmount = 100_000.0;    durationMonths = 12;  }
        }

        double monthlyTarget  = targetAmount / durationMonths;
        // Bank-path users don't supply income/expenses at onboarding time — default
        // to 0 so goal probability is recalculated later from real transactions
        double income3m   = req.getIncomeLast3Months()   != null ? req.getIncomeLast3Months()   : 0.0;
        double expenses3m = req.getExpensesLast3Months()  != null ? req.getExpensesLast3Months()  : 0.0;
        double monthlySavings = (income3m - expenses3m) / 3.0;
        double probability    = monthlyTarget <= 0 ? 50.0
                : Math.min(100.0, Math.max(0.0, (monthlySavings / monthlyTarget) * 100));
        String health = probability >= 100 ? "Excellent"
                : probability >= 70        ? "On Track"
                : probability >= 40        ? "At Risk"
                : "Critical";

        FinancialGoal g = new FinancialGoal();
        g.setTitle(title);
        g.setTargetAmount(targetAmount);
        g.setDurationMonths(durationMonths);
        g.setMonthlyTarget(Math.ceil(monthlyTarget));
        g.setCurrentSaved(0.0);
        g.setProgressPercent(0.0);
        g.setExpectedSaved(0.0);
        g.setGoalHealth(health);
        g.setAvailableSavings(monthlySavings);
        g.setSuccessProbability(Math.round(probability * 10.0) / 10.0);
        g.setAiPlan("Start saving consistently each month.");
        g.setCreatedAt(LocalDate.now());
        g.setUser(user);
        return g;
    }

    private Transaction buildTransaction(User user, String date, String merchant, double amount, String category) {
        Transaction t = new Transaction();
        t.setUser(user);
        t.setDate(date);
        t.setMerchant(merchant);
        t.setAmount(amount);
        t.setCategory(category);
        t.setSource("SEED");
        return t;
    }
}
