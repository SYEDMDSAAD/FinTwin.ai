package com.fintwin.service;

import com.fintwin.dto.NetWorthResponseDTO;
import com.fintwin.model.Asset;
import com.fintwin.model.Investment;
import com.fintwin.model.Liability;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.AssetRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.LiabilityRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NetWorthServiceTest {

    @Mock private AssetRepository assetRepository;
    @Mock private LiabilityRepository liabilityRepository;
    @Mock private TransactionRepository transactionRepository;
    @Mock private UserRepository userRepository;
    @Mock private InvestmentRepository investmentRepository;

    @InjectMocks private NetWorthService service;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        ReflectionTestUtils.setField(user, "id", 1L);
        user.setEmail("test@example.com");

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test@example.com", null, List.of())
        );

        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));
        when(transactionRepository.findLatestThreeMonthsTransactions(1L)).thenReturn(List.of());
        when(investmentRepository.findByUser(user)).thenReturn(List.of());
    }

    @Test
    void getNetWorth_excludesInvestmentTypeAssetsFromTotalAssets() {
        Asset house = asset("House", 5_000_000.0, "Real Estate");
        Asset stocks = asset("HDFC", 200_000.0, "stocks");
        Asset crypto = asset("BTC", 100_000.0, "crypto");
        Asset mf = asset("Axis MF", 50_000.0, "mutual funds");

        when(assetRepository.findByUser(user)).thenReturn(List.of(house, stocks, crypto, mf));
        when(liabilityRepository.findByUser(user)).thenReturn(List.of());

        NetWorthResponseDTO result = service.getNetWorth();

        // Only Real Estate should count — stocks/crypto/MF excluded
        assertThat(result.getTotalAssets()).isEqualTo(5_000_000.0);
    }

    @Test
    void getNetWorth_excludesManualSavingsFromTotalAssets() {
        Asset savings = asset("Savings", 50_000.0, "ManualSavings");
        Asset property = asset("Land", 1_000_000.0, "Real Estate");

        when(assetRepository.findByUser(user)).thenReturn(List.of(savings, property));
        when(liabilityRepository.findByUser(user)).thenReturn(List.of());

        NetWorthResponseDTO result = service.getNetWorth();

        assertThat(result.getTotalAssets()).isEqualTo(1_000_000.0);
        assertThat(result.getSavings()).isEqualTo(50_000.0); // ManualSavings shown in savings
    }

    @Test
    void getNetWorth_netWorthFormula_assetsMinusLiabilitiesPlusSavingsPlusPortfolio() {
        when(assetRepository.findByUser(user)).thenReturn(List.of(asset("Car", 300_000.0, "Vehicle")));
        when(liabilityRepository.findByUser(user)).thenReturn(List.of(liability("Loan", 100_000.0)));

        Investment inv = new Investment();
        inv.setCurrentValue(200_000.0);
        inv.setInvestedAmount(150_000.0);
        when(investmentRepository.findByUser(user)).thenReturn(List.of(inv));

        NetWorthResponseDTO result = service.getNetWorth();

        // assets=300k + savings=0 + portfolio=200k - liabilities=100k = 400k
        assertThat(result.getNetWorth()).isEqualTo(400_000.0);
    }

    @Test
    void getNetWorth_transactionalSavings_incomePlusExpenses() {
        Transaction income = txn(10_000.0);
        Transaction expense = txn(-3_000.0);
        when(transactionRepository.findLatestThreeMonthsTransactions(1L))
                .thenReturn(List.of(income, expense));

        when(assetRepository.findByUser(user)).thenReturn(List.of());
        when(liabilityRepository.findByUser(user)).thenReturn(List.of());

        NetWorthResponseDTO result = service.getNetWorth();

        assertThat(result.getSavings()).isEqualTo(7_000.0);
    }

    @Test
    void getNetWorth_portfolioPnl_currentMinusInvested() {
        Investment inv = new Investment();
        inv.setCurrentValue(120_000.0);
        inv.setInvestedAmount(100_000.0);
        when(investmentRepository.findByUser(user)).thenReturn(List.of(inv));

        when(assetRepository.findByUser(user)).thenReturn(List.of());
        when(liabilityRepository.findByUser(user)).thenReturn(List.of());

        NetWorthResponseDTO result = service.getNetWorth();

        assertThat(result.getPortfolioPnl()).isEqualTo(20_000.0);
        assertThat(result.getPortfolioCount()).isEqualTo(1);
    }

    @Test
    void getNetWorth_investmentWithNullCurrentValue_fallsBackToInvestedAmount() {
        Investment inv = new Investment();
        inv.setCurrentValue(null);
        inv.setInvestedAmount(80_000.0);
        when(investmentRepository.findByUser(user)).thenReturn(List.of(inv));

        when(assetRepository.findByUser(user)).thenReturn(List.of());
        when(liabilityRepository.findByUser(user)).thenReturn(List.of());

        NetWorthResponseDTO result = service.getNetWorth();

        assertThat(result.getPortfolioCurrentValue()).isEqualTo(80_000.0);
        assertThat(result.getPortfolioPnl()).isEqualTo(0.0);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private Asset asset(String name, double amount, String type) {
        Asset a = new Asset();
        a.setName(name);
        a.setAmount(amount);
        a.setType(type);
        return a;
    }

    private Liability liability(String name, double amount) {
        Liability l = new Liability();
        l.setName(name);
        l.setAmount(amount);
        return l;
    }

    private Transaction txn(double amount) {
        Transaction t = new Transaction();
        t.setAmount(amount);
        return t;
    }
}
