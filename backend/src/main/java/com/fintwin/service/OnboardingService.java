package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.dto.OnboardingRequestDTO;
import com.fintwin.model.Asset;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.Investment;
import com.fintwin.model.Liability;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.AssetRepository;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.InvestmentRepository;
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
        { 28, "Miscellaneous", "Other",         0.10 },
    };

    private final UserRepository            userRepository;
    private final AssetRepository           assetRepository;
    private final LiabilityRepository       liabilityRepository;
    private final FinancialGoalRepository   goalRepository;
    private final TransactionRepository     transactionRepository;
    private final InvestmentRepository      investmentRepository;

    public OnboardingService(
            UserRepository userRepository,
            AssetRepository assetRepository,
            LiabilityRepository liabilityRepository,
            FinancialGoalRepository goalRepository,
            TransactionRepository transactionRepository,
            InvestmentRepository investmentRepository) {
        this.userRepository       = userRepository;
        this.assetRepository      = assetRepository;
        this.liabilityRepository  = liabilityRepository;
        this.goalRepository       = goalRepository;
        this.transactionRepository = transactionRepository;
        this.investmentRepository  = investmentRepository;
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
        investmentRepository.deleteAll(investmentRepository.findByUser(user));

        // Savings asset
        if (request.getSavings() > 0) {
            Asset savings = new Asset();
            savings.setName("Manual Savings");
            savings.setType("ManualSavings");
            savings.setAmount(request.getSavings());
            savings.setUser(user);
            assetRepository.save(savings);
        }

        // Investment portfolio — stored in investments table so it appears in Portfolio page
        // and is correctly included in portfolioCurrentValue in NetWorthService
        if (request.getInvestments() > 0) {
            Investment inv = new Investment();
            inv.setName("Investment Portfolio");
            inv.setType("Other");
            inv.setCurrentValue(request.getInvestments());
            inv.setInvestedAmount(request.getInvestments());
            inv.setPurchaseDate(LocalDate.now());
            inv.setUser(user);
            investmentRepository.save(inv);
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
        int n = request.getNumberOfMonths() != null && request.getNumberOfMonths() >= 2
                ? request.getNumberOfMonths() : 3;

        // Derive monthly average from the total the user provided for n months
        double monthlyIncome   = request.getIncomeLast3Months()   / n;
        double monthlyExpenses = request.getExpensesLast3Months() / n;

        // Previous period modelled as slightly lower income / higher expenses (improving trend)
        double prevMonthlyIncome   = monthlyIncome   * 0.90;
        double prevMonthlyExpenses = monthlyExpenses * 1.20;

        LocalDate today      = LocalDate.now();
        int       total      = 2 * n;  // n previous months + n current months

        List<Transaction> batch = new ArrayList<>(total * 12);

        for (int i = 0; i < total; i++) {
            boolean isPrev    = i < n;
            double  mIncome   = isPrev ? prevMonthlyIncome   : monthlyIncome;
            double  mExpenses = isPrev ? prevMonthlyExpenses : monthlyExpenses;

            // Oldest month first: (total-1) months ago → 0 months ago
            LocalDate month = today.minusMonths(total - 1 - i);

            batch.add(buildTransaction(user, month.withDayOfMonth(1), "Employer", mIncome, "Income"));

            for (Object[] row : EXPENSE_TEMPLATE) {
                int    day      = (int)    row[0];
                String merchant = (String) row[1];
                String category = (String) row[2];
                double fraction = (double) row[3];

                LocalDate txDate = month.withDayOfMonth(day);
                if (!txDate.isAfter(today)) {
                    batch.add(buildTransaction(user, txDate, merchant, -(mExpenses * fraction), category));
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
        int    nMonths    = req.getNumberOfMonths()       != null && req.getNumberOfMonths() >= 2
                            ? req.getNumberOfMonths() : 3;
        double monthlySavings = (income3m - expenses3m) / nMonths;
        double probability    = com.fintwin.util.GoalMath.successProbability(monthlySavings, monthlyTarget);
        String health         = com.fintwin.util.GoalMath.health(monthlySavings, monthlyTarget);

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

    private Transaction buildTransaction(User user, LocalDate date, String merchant, double amount, String category) {
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
