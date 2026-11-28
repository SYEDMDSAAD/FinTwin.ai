package com.fintwin.service;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.FinancialGoalRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.SipPlanRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.InvestmentPlan;
import com.fintwin.util.TransactionMath;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/** The user's own numbers for the Plan tab; see {@link InvestmentPlan}. */
@Service
public class InvestmentPlanService {

    private final UserRepository users;
    private final TransactionRepository transactions;
    private final NetWorthService netWorth;
    private final FinancialGoalRepository goals;
    private final InvestmentRepository investments;
    private final SipPlanRepository sips;

    public InvestmentPlanService(UserRepository users, TransactionRepository transactions,
                                 NetWorthService netWorth, FinancialGoalRepository goals,
                                 InvestmentRepository investments, SipPlanRepository sips) {
        this.users = users;
        this.transactions = transactions;
        this.netWorth = netWorth;
        this.goals = goals;
        this.investments = investments;
        this.sips = sips;
    }

    @Transactional(readOnly = true)
    public InvestmentPlan.Result plan() {
        User user = users.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
        List<Transaction> recent = transactions.findLatestThreeMonthsTransactions(user.getId());
        int months = TransactionMath.monthsPresent(recent);
        double income = TransactionMath.income(recent) / months;
        double spend = TransactionMath.expenses(recent) / months;
        Double liquid = netWorth.getNetWorth().getSavings();
        return InvestmentPlan.build(income, spend, liquid == null ? 0 : liquid, goals.findByUser(user),
                investments.findByUser(user), sips.findByUserOrderByCreatedAtAsc(user), LocalDate.now());
    }
}
