package com.fintwin.service;

import com.fintwin.dto.InvestmentDTO;
import com.fintwin.exception.BadRequestException;
import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class HoldingLinkServiceTest {

    @Mock private DiscoverService market;
    @Mock private InvestmentRepository investments;
    @Mock private UserRepository users;

    private HoldingLinkService service;
    private User user;

    @BeforeEach
    void setUp() {
        service = new HoldingLinkService(market, investments, users);
        user = new User();
        ReflectionTestUtils.setField(user, "id", 13L);
        user.setEmail("u@example.com");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("u@example.com", null, List.of()));
        when(users.findByEmail("u@example.com")).thenReturn(Optional.of(user));
        when(investments.save(any(Investment.class))).thenAnswer(i -> i.getArgument(0));
    }

    @Test
    void unitsAreTheAmountOverThePriceThatDay() {
        assertThat(HoldingLinkService.units(HoldingLinkService.Kind.FUND, 15000, 86.2413, null)).isEqualTo(173.931);
        assertThat(HoldingLinkService.units(HoldingLinkService.Kind.STOCK, 15000, 840.6, null)).isEqualTo(17.8444);
        // the count the broker shows wins
        assertThat(HoldingLinkService.units(HoldingLinkService.Kind.STOCK, 15000, 840.6, 17.0)).isEqualTo(17.0);
    }

    @Test
    void aFundBoughtOnADateIsValuedAtTodaysNav() {
        when(market.fundNavOn("122640", LocalDate.of(2025, 9, 20)))
                .thenReturn(Map.of("code", "122640", "date", "2025-09-22", "nav", 86.2413));
        when(market.fundLatest("122640")).thenReturn(Map.of("code", "122640", "nav", 90.5324));

        Map<String, Object> v = service.preview("fund", "122640", LocalDate.of(2025, 9, 20), 15000.0, null);

        assertThat(v).containsEntry("units", 173.931).containsEntry("purchasePrice", 86.2413)
                .containsEntry("currentPrice", 90.5324).containsEntry("currentValue", 15746.39)
                .containsEntry("gain", 746.39).containsEntry("gainPct", 4.98);
    }

    @Test
    void aStockUsesTheCloseThatDayAndTheLatestCloseToday() {
        when(market.stockPriceOn(eq("HDFCBANK"), eq(LocalDate.of(2026, 3, 14))))
                .thenReturn(Map.of("symbol", "HDFCBANK.NS", "date", "2026-03-16", "price", 840.6));
        when(market.stockPriceOn(eq("HDFCBANK.NS"), any()))
                .thenReturn(Map.of("symbol", "HDFCBANK.NS", "date", "2026-09-22", "price", 743.75));

        Map<String, Object> v = service.preview("STOCK", "hdfcbank", LocalDate.of(2026, 3, 14), 15000.0, null);

        assertThat(v).containsEntry("symbol", "HDFCBANK.NS").containsEntry("units", 17.8444)
                .containsEntry("currentValue", 13271.77).containsEntry("gainPct", -11.52);
    }

    @Test
    void linkingTurnsTheOnboardingSumIntoARealHolding() {
        Investment sum = new Investment();
        ReflectionTestUtils.setField(sum, "id", 5L);
        sum.setUser(user);
        sum.setName("Investment Portfolio");
        sum.setType("Other");
        sum.setInvestedAmount(15000.0);
        sum.setCurrentValue(15000.0);
        when(investments.findById(5L)).thenReturn(Optional.of(sum));
        when(market.fundNavOn(eq("122640"), any())).thenReturn(Map.of("nav", 86.2413));
        when(market.fundLatest("122640")).thenReturn(Map.of("nav", 90.5324));

        InvestmentDTO dto = service.link(5L, "FUND", "122640", "Parag Parikh Flexi Cap Fund - Direct Plan - Growth",
                LocalDate.of(2025, 9, 20), 15000.0, null);

        assertThat(sum.getType()).isEqualTo("Mutual Fund");
        assertThat(sum.getName()).startsWith("Parag Parikh");
        assertThat(sum.getTickerCode()).isEqualTo("122640");
        assertThat(sum.getUnits()).isEqualTo(173.931);
        assertThat(sum.getPurchaseDate()).isEqualTo(LocalDate.of(2025, 9, 20));
        assertThat(dto.getCurrentValue()).isEqualTo(15746.39);
    }

    @Test
    void someoneElsesHoldingCantBeLinked() {
        User other = new User();
        ReflectionTestUtils.setField(other, "id", 99L);
        Investment theirs = new Investment();
        theirs.setUser(other);
        when(investments.findById(7L)).thenReturn(Optional.of(theirs));

        assertThatThrownBy(() -> service.link(7L, "FUND", "122640", "x", LocalDate.of(2025, 1, 1), 100.0, null))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    void inputIsCheckedBeforeAnyPriceIsFetched() {
        assertThatThrownBy(() -> service.preview("FUND", "122640", LocalDate.now().plusDays(3), 100.0, null))
                .isInstanceOf(BadRequestException.class).hasMessageContaining("future");
        assertThatThrownBy(() -> service.preview("FUND", "122640", null, 100.0, null)).hasMessageContaining("date");
        assertThatThrownBy(() -> service.preview("FUND", "122640", LocalDate.of(2025, 1, 1), 0.0, null)).hasMessageContaining("amount");
        assertThatThrownBy(() -> service.preview("FUND", "abc", LocalDate.of(2025, 1, 1), 100.0, null)).hasMessageContaining("fund");
        assertThatThrownBy(() -> service.preview("GOLD", "X", LocalDate.of(2025, 1, 1), 100.0, null)).hasMessageContaining("STOCK or FUND");
        org.mockito.Mockito.verifyNoInteractions(market);
    }
}
