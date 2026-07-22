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

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Objects;
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
                        new com.fintwin.exception.NotFoundException("User not found")
                );

        List<Asset> assetsList = assetRepository.findByUser(user);
        List<Liability> liabilitiesList = liabilityRepository.findByUser(user);

        // Manual savings entered at onboarding (tagged as ManualSavings type)
        // Exact BigDecimal sums — money totals must not accumulate float error.
        BigDecimal manualSavings = assetsList.stream()
                .filter(a -> "ManualSavings".equalsIgnoreCase(a.getType()))
                .map(a -> nz(a.getAmountExact()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Transactional savings = net cash flow from last 3 months of transactions
        // For manual users this is seeded data; replaced by real bank data after connection
        List<Transaction> transactions =
                transactionRepository.findLatestThreeMonthsTransactions(user.getId());

        BigDecimal txIncome = transactions.stream()
                .filter(t -> !com.fintwin.util.TransactionMath.isSelfTransfer(t))
                .map(Transaction::getAmountExact)
                .filter(Objects::nonNull)
                .filter(a -> a.signum() > 0)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal txExpenses = transactions.stream()
                .filter(t -> !com.fintwin.util.TransactionMath.isSelfTransfer(t))
                .map(Transaction::getAmountExact)
                .filter(Objects::nonNull)
                .filter(a -> a.signum() < 0)
                .map(BigDecimal::abs)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal transactionalSavings = txIncome.subtract(txExpenses);

        // Manual savings is the user's stated current balance — authoritative when present.
        // For bank users (manualSavings = 0), derive savings from real transaction cash flow.
        BigDecimal totalSavings = manualSavings.signum() > 0 ? manualSavings : transactionalSavings;

        // Total assets excludes ManualSavings (shown separately in savings card)
        // AND excludes investment-type assets (those belong in the Investment Portfolio page)
        BigDecimal totalAssets = assetsList.stream()
                .filter(a -> !"ManualSavings".equalsIgnoreCase(a.getType()))
                .filter(a -> !INVESTMENT_TYPES.contains(
                        a.getType() != null ? a.getType().toLowerCase().trim() : ""))
                .map(a -> nz(a.getAmountExact()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal totalLiabilities = liabilitiesList.stream()
                .map(l -> nz(l.getAmountExact()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Investment portfolio (Investment Portfolio page)
        List<Investment> investments = investmentRepository.findByUser(user);

        BigDecimal portfolioCurrentValue = investments.stream()
                .map(i -> i.getCurrentValueExact() != null ? i.getCurrentValueExact()
                        : nz(i.getInvestedAmountExact()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal portfolioInvested = investments.stream()
                .map(i -> nz(i.getInvestedAmountExact()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal portfolioPnl = portfolioCurrentValue.subtract(portfolioInvested);

        // Net Worth = assets + savings + portfolio current value - liabilities
        BigDecimal netWorth = totalAssets.add(totalSavings).add(portfolioCurrentValue).subtract(totalLiabilities);

        NetWorthResponseDTO dto = new NetWorthResponseDTO();
        dto.setAssets(assetsList);
        dto.setLiabilities(liabilitiesList);
        dto.setSavings(money(totalSavings));
        dto.setTotalAssets(money(totalAssets));
        dto.setTotalLiabilities(money(totalLiabilities));
        dto.setNetWorth(money(netWorth));
        dto.setPortfolioCurrentValue(money(portfolioCurrentValue));
        dto.setPortfolioInvested(money(portfolioInvested));
        dto.setPortfolioPnl(money(portfolioPnl));
        dto.setPortfolioCount(investments.size());

        return dto;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    // Money to the JSON edge: round to 2dp (half-up) and hand the frontend a double.
    private static double money(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP).doubleValue();
    }
}
