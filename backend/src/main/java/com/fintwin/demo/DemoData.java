package com.fintwin.demo;

import com.fintwin.model.Asset;
import com.fintwin.model.Budget;
import com.fintwin.model.FinancialGoal;
import com.fintwin.model.InsurancePolicy;
import com.fintwin.model.Investment;
import com.fintwin.model.Liability;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.util.Categorized;
import com.fintwin.util.GoalMath;

import com.fintwin.service.SpendGuardLinks;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * The demo account's sample data: Riya Mehta, a software engineer in Pune
 * on ₹72,000 a month, with about three months of everyday Indian spending.
 *
 * Dates are counted back from {@code today}, so the demo never shows a
 * stale or empty month. Amounts come from a fixed seed: the picture is the
 * same every day, only shifted, which keeps what a visitor sees (and the
 * copilot's answers) consistent.
 */
final class DemoData {

    static final double SALARY = 72_000;
    static final int DAYS = 92;

    /** Days ago, payee, amount, category: what the sorting agent sorted on the last import. */
    static final Object[][] AUTO_SORTED = {
            {1, "Paid to SHREE SAI HARDWARE", -1_240.0, "Shopping"},
            {3, "Paid to SHREE SAI HARDWARE", -380.0, "Shopping"},
            {4, "Paid to PUNE CITY DIAGNOSTICS", -1_800.0, "Health"},
            {2, "Paid to KAKA HALWAI SWEETS", -560.0, "Food"},
            {6, "Paid to KAKA HALWAI SWEETS", -320.0, "Food"},
    };
    /** The payees above, biggest spend first, as the sorting agent's summary names them. */
    static final List<String> AUTO_SORTED_PAYEES = List.of("SHREE SAI HARDWARE", "PUNE CITY DIAGNOSTICS",
            "KAKA HALWAI SWEETS");

    private final User user;
    private final LocalDate today;
    private final LocalDate from;
    private final Random random = new Random(20261002L);

    DemoData(User user, LocalDate today) {
        this.user = user;
        this.today = today;
        this.from = today.minusDays(DAYS - 1);
    }

    List<Transaction> transactions() {
        List<Transaction> out = new ArrayList<>();
        // Monthly, on a fixed day: salary, rent, investing, EMI, bills, subscriptions.
        // The salary lands the day before today, so the salary-day help (the
        // goal agent and Spend Guard's Salary day) is always there to see.
        int salaryDay = today.minusDays(1).getDayOfMonth();
        for (LocalDate month = from.withDayOfMonth(1); !month.isAfter(today); month = month.plusMonths(1)) {
            monthly(out, month, salaryDay, "BRIGHTWAVE TECHNOLOGIES PVT LTD", SALARY, "Income", Categorized.BRAND);
            monthly(out, month, 3, "Paid to Netflix", -649, "Entertainment", Categorized.BRAND);
            monthly(out, month, 5, "Paid to Sunita Deshpande", -18_000, "Rent", Categorized.PERSON);
            monthly(out, month, 6, "Paid to Mom", -5_000, "People", Categorized.PERSON);
            monthly(out, month, 7, "Bajaj Finance EMI", -3_200, "EMI", Categorized.BRAND);
            monthly(out, month, 10, "Groww Mutual Fund SIP", -5_000, "Investments", Categorized.BRAND);
            monthly(out, month, 10, "PPF deposit", -2_000, "Investments", Categorized.BRAND);
            monthly(out, month, 12, "Airtel Postpaid", -599, "Bills", Categorized.BRAND);
            monthly(out, month, 14, "JioFiber Broadband", -999, "Bills", Categorized.BRAND);
            monthly(out, month, 16, "MSEDCL Electricity Bill", -between(1_050, 1_650), "Utilities", Categorized.BRAND);
            monthly(out, month, 20, "Paid to Spotify", -119, "Entertainment", Categorized.BRAND);
        }

        // Day to day
        for (LocalDate day = from; !day.isAfter(today); day = day.plusDays(1)) {
            if (chance(0.45)) add(out, day, "Paid to RAMESH KUMAR PAWAR", -pick(20, 20, 30, 40), "Local Shops",
                    Categorized.PAYMENT_PATTERN);                                    // the tea stall
            if (chance(0.18)) add(out, day, "Paid to MAHESH SHINDE", -between(60, 180), "Local Shops",
                    Categorized.PAYMENT_PATTERN);                                    // vegetables
            if (chance(0.22)) add(out, day, pick("Swiggy", "Zomato"), -between(180, 650), "Food", Categorized.BRAND);
            if (chance(0.05)) add(out, day, "Starbucks", -between(320, 480), "Food", Categorized.BRAND);
            if (chance(0.10)) add(out, day, "DMart", -between(900, 2_600), "Groceries", Categorized.BRAND);
            if (chance(0.10)) add(out, day, "Blinkit", -between(250, 700), "Groceries", Categorized.BRAND);
            if (chance(0.15)) add(out, day, pick("Uber", "Ola", "Rapido"), -between(90, 380), "Transport",
                    Categorized.BRAND);
            if (chance(0.06)) add(out, day, "HP Petrol Pump", -between(400, 700), "Transport", Categorized.BRAND);
            if (chance(0.07)) add(out, day, "Amazon", -between(299, 2_499), "Shopping", Categorized.BRAND);
            if (chance(0.03)) add(out, day, "Myntra", -between(999, 2_499), "Shopping", Categorized.BRAND);
            if (chance(0.04)) add(out, day, "Apollo Pharmacy", -between(150, 800), "Health", Categorized.BRAND);
            if (chance(0.05)) add(out, day, "Paid to Aman Gupta", -between(300, 900), "People", Categorized.PERSON);
            if (chance(0.03)) add(out, day, "Received from Aman Gupta", between(300, 1_200), "People",
                    Categorized.PERSON);
            if (chance(0.03)) add(out, day, "BookMyShow", -between(250, 700), "Entertainment", Categorized.BRAND);
        }

        // One-offs, at fixed points in the window
        add(out, today.minusDays(70), "IRCTC", -1_385, "Travel", Categorized.BRAND);
        add(out, today.minusDays(41), "Croma", -12_999, "Shopping", Categorized.BRAND);
        add(out, today.minusDays(33), "Udemy", -449, "Education", Categorized.BRAND);
        add(out, today.minusDays(18), "MakeMyTrip", -5_420, "Travel", Categorized.BRAND);

        // For the subscription agent: one plan renewing in two days, and one
        // whose latest charge went up
        for (int k = 1; k <= 3; k++) {
            addInWindow(out, today.plusDays(2).minusMonths(k), "YouTube Premium", -149, "Entertainment");
        }
        for (int k = 0; k <= 2; k++) {
            addInWindow(out, today.minusDays(5).minusMonths(k), "Disney+ Hotstar", k == 0 ? -399 : -299,
                    "Entertainment");
        }

        // For the watch agent: today's Swiggy order is far above the usual one
        out.removeIf(t -> today.equals(t.getDate()) && "Swiggy".equals(t.getMerchant()));
        add(out, today, "Swiggy", -2_840, "Food", Categorized.BRAND);

        // For the sorting agent: payees no rule knew, sorted by FinTwin and
        // waiting in Transactions for a yes or a fix (see AUTO_SORTED)
        for (Object[] row : AUTO_SORTED) {
            add(out, today.minusDays((int) row[0]), (String) row[1], (double) row[2], (String) row[3],
                    Categorized.LLM_AUTO);
        }

        // Spend Guard payments, as the Transactions page shows them: one paid
        // yesterday that no statement has confirmed yet, and one the last
        // statement didn't show (the user is asked whether they paid)
        spendGuard(out, today.minusDays(1), "Chai Corner", -450, "Food", "d3e00000000000000001",
                SpendGuardLinks.SOURCE);
        spendGuard(out, today.minusDays(4), "Paid to Rohan", -2_000, "People", "d3e00000000000000002",
                SpendGuardLinks.SOURCE_NOT_IN_STATEMENT);
        return out;
    }

    private void spendGuard(List<Transaction> out, LocalDate date, String merchant, double amount, String category,
                            String eventId, String source) {
        add(out, date, merchant, amount, category, Categorized.BRAND);
        Transaction t = out.get(out.size() - 1);
        t.setSource(source);
        t.setExternalId(SpendGuardLinks.EXTERNAL_ID_PREFIX + eventId);
    }

    List<Budget> budgets() {
        // Close to what Riya spends, except Shopping: set too low, so the
        // budget agent has a limit to question
        return List.of(budget("Food", 11_000), budget("Groceries", 11_000), budget("Shopping", 3_500),
                budget("Entertainment", 2_000), budget("Transport", 4_000));
    }

    List<FinancialGoal> goals(double monthlySavings) {
        return List.of(
                goal("Emergency Fund", 200_000, 85_000, 12, 120, monthlySavings),
                goal("Goa Trip", 45_000, 18_000, 6, 60, monthlySavings),
                goal("Car Down Payment", 300_000, 60_000, 30, 150, monthlySavings));
    }

    List<Asset> assets() {
        return List.of(asset("EPF balance", "Provident Fund", 210_000),
                asset("Gold jewellery", "Jewellery", 120_000),
                asset("Honda Activa", "Vehicle", 55_000),
                asset("Savings account", "Other", 95_000));
    }

    List<Liability> liabilities() {
        Liability loan = liability("Bajaj two-wheeler loan", "Personal Loan", 38_000);
        loan.setEmi(3_200.0);
        loan.setInterestRate(11.5);
        loan.setTermMonths(12);
        return List.of(loan, liability("Credit card dues", "Credit Card", 7_800));
    }

    List<Investment> investments() {
        return List.of(
                investment("Parag Parikh Flexi Cap Fund", "Mutual Fund", 60_000, 71_800, 420, null, null),
                investment("Nippon India Nifty 50 Index Fund", "Mutual Fund", 30_000, 33_900, 300, null, null),
                investment("Tata Consultancy Services", "Stocks", 15_200, 15_800, 200, "TCS.NS", 4.0),
                investment("Public Provident Fund", "PPF", 48_000, 51_600, 700, null, null));
    }

    /** A health cover and a term plan, one of them renewing within the month. */
    List<InsurancePolicy> insurance() {
        return List.of(
                policy("Health", "Star Health", 14_500, "Annually", 500_000, 21, "Family floater for Riya and her parents"),
                policy("Term", "LIC", 1_150, "Monthly", 10_000_000, 160, "Term cover till 60"));
    }

    // ── Builders ──────────────────────────────────────────────────────────────

    private InsurancePolicy policy(String type, String provider, double premium, String frequency,
                                   double sumAssured, int renewsInDays, String notes) {
        InsurancePolicy p = new InsurancePolicy();
        p.setType(type);
        p.setProvider(provider);
        p.setPremium(String.valueOf((long) premium));
        p.setFrequency(frequency);
        p.setSumAssured(String.valueOf((long) sumAssured));
        p.setRenewalDate(today.plusDays(renewsInDays));
        p.setNotes(notes);
        p.setUser(user);
        return p;
    }

    private void monthly(List<Transaction> out, LocalDate month, int day, String merchant, double amount,
                         String category, String source) {
        LocalDate date = month.withDayOfMonth(Math.min(day, month.lengthOfMonth()));
        if (!date.isBefore(from) && !date.isAfter(today)) add(out, date, merchant, amount, category, source);
    }

    private void addInWindow(List<Transaction> out, LocalDate date, String merchant, double amount, String category) {
        if (!date.isBefore(from) && !date.isAfter(today)) add(out, date, merchant, amount, category, Categorized.BRAND);
    }

    private void add(List<Transaction> out, LocalDate date, String merchant, double amount, String category,
                     String categorySource) {
        Transaction t = new Transaction();
        t.setUser(user);
        t.setDate(date);
        t.setMerchant(merchant);
        t.setAmount(amount);
        t.setCategory(category);
        t.setCategorySource(categorySource);
        t.setSource("STATEMENT");
        out.add(t);
    }

    private Budget budget(String category, double limit) {
        Budget b = new Budget();
        b.setCategory(category);
        b.setLimitAmount(limit);
        b.setUser(user);
        return b;
    }

    private FinancialGoal goal(String title, double target, double saved, int months, int startedDaysAgo,
                               double monthlySavings) {
        double monthlyTarget = Math.ceil((target - saved) / months);
        FinancialGoal g = new FinancialGoal();
        g.setTitle(title);
        g.setTargetAmount(target);
        g.setCurrentSaved(saved);
        g.setDurationMonths(months);
        g.setMonthlyTarget(monthlyTarget);
        g.setProgressPercent(Math.round(saved / target * 1000) / 10.0);
        g.setExpectedSaved(saved);
        g.setAvailableSavings(monthlySavings);
        g.setGoalHealth(GoalMath.health(monthlySavings, monthlyTarget));
        g.setSuccessProbability(Math.round(GoalMath.successProbability(monthlySavings, monthlyTarget) * 10) / 10.0);
        g.setAiPlan("Set aside about ₹" + String.format("%,.0f", monthlyTarget)
                + " a month and you're on course. Automate it on salary day so it happens before spending does.");
        g.setCreatedAt(today.minusDays(startedDaysAgo));
        g.setUser(user);
        return g;
    }

    private Asset asset(String name, String type, double amount) {
        Asset a = new Asset();
        a.setName(name);
        a.setType(type);
        a.setAmount(amount);
        a.setUser(user);
        return a;
    }

    private Liability liability(String name, String type, double amount) {
        Liability l = new Liability();
        l.setName(name);
        l.setType(type);
        l.setAmount(amount);
        l.setUser(user);
        return l;
    }

    private Investment investment(String name, String type, double invested, double current, int boughtDaysAgo,
                                  String ticker, Double units) {
        Investment i = new Investment();
        i.setUser(user);
        i.setName(name);
        i.setType(type);
        i.setInvestedAmount(invested);
        i.setCurrentValue(current);
        i.setPurchaseDate(today.minusDays(boughtDaysAgo));
        if (ticker != null) i.setTickerCode(ticker);
        if (units != null) i.setUnits(units);
        if ("PPF".equals(type)) i.setInterestRate(7.1);
        return i;
    }

    private boolean chance(double p) {
        return random.nextDouble() < p;
    }

    private double between(int lo, int hi) {
        return lo + random.nextInt(hi - lo + 1);
    }

    @SafeVarargs
    private <T> T pick(T... options) {
        return options[random.nextInt(options.length)];
    }
}
