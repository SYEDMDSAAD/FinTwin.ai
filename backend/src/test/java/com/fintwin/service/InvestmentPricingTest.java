package com.fintwin.service;

import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** A holding with a symbol is priced the moment it is saved, and says so when it can't be. */
class InvestmentPricingTest {

    private InvestmentRepository repo;
    private RestTemplate ai;
    private InvestmentService service;
    private final User user = new User();

    @BeforeEach
    void setUp() {
        repo = mock(InvestmentRepository.class);
        ai = mock(RestTemplate.class);
        UserRepository users = mock(UserRepository.class);
        service = new InvestmentService(repo, users, mock(TransactionRepository.class));
        ReflectionTestUtils.setField(service, "aiRestTemplate", ai);
        ReflectionTestUtils.setField(service, "aiServiceUrl", "http://ai");

        ReflectionTestUtils.setField(user, "id", 1L);
        when(users.findByEmail(any())).thenReturn(Optional.of(user));
        when(repo.save(any(Investment.class))).thenAnswer(i -> {
            Investment saved = i.getArgument(0);
            if (saved.getId() == null) saved.setId(7L);
            return saved;
        });
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test@example.com", null, List.of()));
    }

    private Investment holding(String ticker, Double units) {
        Investment inv = new Investment();
        inv.setName("SS Retail");
        inv.setType("Stocks");
        inv.setInvestedAmount(14000.0);
        inv.setCurrentValue(14000.0);
        inv.setTickerCode(ticker);
        inv.setUnits(units);
        return inv;
    }

    @SuppressWarnings("unchecked")
    private void marketReturns(Object currentValue) {
        when(ai.exchange(eq("http://ai/market/prices"), any(), any(), any(org.springframework.core.ParameterizedTypeReference.class)))
                .thenReturn(org.springframework.http.ResponseEntity.ok(
                        List.of(new java.util.HashMap<>(Map.of("id", 7, "currentValue", currentValue)))));
    }

    @Test
    void aKnownSymbolIsPricedOnSave() {
        marketReturns(15200.0);
        var dto = service.add(holding("HDFCBANK", 10.0));
        assertThat(dto.getPriceStatus()).isEqualTo(InvestmentService.PRICE_LIVE);
        assertThat(dto.getCurrentValue()).isEqualTo(15200.0);
    }

    @Test
    @SuppressWarnings("unchecked")
    void aSymbolTheMarketDoesNotKnowIsReportedNotJustLeftFlat() {
        when(ai.exchange(eq("http://ai/market/prices"), any(), any(), any(org.springframework.core.ParameterizedTypeReference.class)))
                .thenReturn(org.springframework.http.ResponseEntity.ok(List.of()));   // nothing priced
        var dto = service.add(holding("SS RETAIL", 10.0));
        assertThat(dto.getPriceStatus()).isEqualTo(InvestmentService.PRICE_NOT_FOUND);
        assertThat(dto.getCurrentValue()).isEqualTo(14000.0);          // untouched
    }

    @Test
    @SuppressWarnings("unchecked")
    void marketDataBeingDownIsSaidPlainly() {
        when(ai.exchange(eq("http://ai/market/prices"), any(), any(), any(org.springframework.core.ParameterizedTypeReference.class)))
                .thenThrow(new ResourceAccessException("down"));
        assertThat(service.add(holding("HDFCBANK", 10.0)).getPriceStatus())
                .isEqualTo(InvestmentService.PRICE_UNAVAILABLE);
    }

    @Test
    void aHoldingWithNothingToPriceIsLeftAlone() {
        assertThat(service.add(holding(null, null)).getPriceStatus()).isNull();
        assertThat(service.add(holding("HDFCBANK", null)).getPriceStatus()).isNull();
        verify(ai, never()).exchange(anyString(), any(), any(), any(org.springframework.core.ParameterizedTypeReference.class));
    }

    @Test
    void anIpoThatHasNotListedIsNotPriced() {
        Investment ipo = holding("NEWCO", 10.0);
        ipo.setType("IPO");
        ipo.setIpoStatus("ALLOTTED");
        assertThat(service.add(ipo).getPriceStatus()).isNull();
    }
}
