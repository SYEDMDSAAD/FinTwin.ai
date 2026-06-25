package com.fintwin.service;

import com.fintwin.dto.NetWorthResponseDTO;
import com.fintwin.model.Asset;
import com.fintwin.model.Investment;
import com.fintwin.model.Liability;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.audit.Audited;
import com.fintwin.repository.*;
import com.fintwin.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;

@Service
public class NetWorthService {

    // These types belong in the Investment Portfolio page — excluded from the Assets bucket
    // so they don't double-count with the investments table.
    private static final Set<String> INVESTMENT_TYPES = Set.of(
        "stocks", "stock", "mutual fund", "mutual funds", "mf",
        "fixed deposit", "fd", "gold", "ppf", "nps", "bonds", "bond",
        "crypto", "cryptocurrency", "investment", "investments"
    );

    @Autowired private AssetRepository assetRepository;
    @Autowired private LiabilityRepository liabilityRepository;
    @Autowired private TransactionRepository transactionRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private InvestmentRepository investmentRepository;

    @PreAuthorize("hasAuthority('READ_OWN_NET_WORTH')")
    @Audited(action = "READ", resource = "net_worth", description = "User viewed net worth dashboard")
    public NetWorthResponseDTO getNetWorth() {

        String email = SecurityUtils.getCurrentUserEmail();

        User user = userRepository
                .findByEmail(email)
                .orElseThrow(() ->
                        new RuntimeException("User not found")
                );

        List<Asset> assetsList = assetRepository.findByUser(user);
        List<Liability> liabilitiesList = liabilityRepository.findByUser(user);

        // Manual savings entered at onboarding (tagged as ManualSavings type)
        double manualSavings = assetsList.stream()
                .filter(a -> "ManualSavings".equalsIgnoreCase(a.getType()))
                .mapToDouble(Asset::getAmount)
                .sum();

        // Transactional savings = net cash flow from last 3 months of transactions
        // For manual users this is seeded data; replaced by real bank data after connection
        List<Transaction> transactions =
                transactionRepository.findLatestThreeMonthsTransactions(user.getId());

        double txIncome = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() > 0)
                .mapToDouble(Transaction::getAmount)
                .sum();

        double txExpenses = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0)
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double transactionalSavings = txIncome - txExpenses;

        // Manual savings is the user's stated current balance — authoritative when present.
        // For bank users (manualSavings = 0), derive savings from real transaction cash flow.
        double totalSavings = manualSavings > 0 ? manualSavings : transactionalSavings;

        // Total assets excludes ManualSavings (shown separately in savings card)
        // AND excludes investment-type assets (those belong in the Investment Portfolio page)
        double totalAssets = assetsList.stream()
                .filter(a -> !"ManualSavings".equalsIgnoreCase(a.getType()))
                .filter(a -> !INVESTMENT_TYPES.contains(
                        a.getType() != null ? a.getType().toLowerCase().trim() : ""))
                .mapToDouble(Asset::getAmount)
                .sum();

        double totalLiabilities = liabilitiesList.stream()
                .mapToDouble(Liability::getAmount)
                .sum();

        // Investment portfolio (Investment Portfolio page)
        List<Investment> investments = investmentRepository.findByUser(user);

        double portfolioCurrentValue = investments.stream()
                .mapToDouble(i -> i.getCurrentValue() != null ? i.getCurrentValue()
                        : (i.getInvestedAmount() != null ? i.getInvestedAmount() : 0))
                .sum();

        double portfolioInvested = investments.stream()
                .mapToDouble(i -> i.getInvestedAmount() != null ? i.getInvestedAmount() : 0)
                .sum();

        double portfolioPnl = Math.round((portfolioCurrentValue - portfolioInvested) * 100.0) / 100.0;

        // Net Worth = assets + savings + portfolio current value - liabilities
        double netWorth = totalAssets + totalSavings + portfolioCurrentValue - totalLiabilities;

        NetWorthResponseDTO dto = new NetWorthResponseDTO();
        dto.setAssets(assetsList);
        dto.setLiabilities(liabilitiesList);
        dto.setSavings(totalSavings);
        dto.setTotalAssets(totalAssets);
        dto.setTotalLiabilities(totalLiabilities);
        dto.setNetWorth(netWorth);
        dto.setPortfolioCurrentValue(Math.round(portfolioCurrentValue * 100.0) / 100.0);
        dto.setPortfolioInvested(Math.round(portfolioInvested * 100.0) / 100.0);
        dto.setPortfolioPnl(portfolioPnl);
        dto.setPortfolioCount(investments.size());

        return dto;
    }
}
