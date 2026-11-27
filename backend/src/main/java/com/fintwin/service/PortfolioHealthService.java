package com.fintwin.service;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.HoldingTransactionRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.PortfolioHealth;
import com.fintwin.util.TaxHarvest;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/** The portfolio's health check and this year's tax-free gains; see {@link PortfolioHealth}, {@link TaxHarvest}. */
@Service
public class PortfolioHealthService {

    public record Health(List<PortfolioHealth.Check> checks, TaxHarvest.Result tax) {}

    public record History(List<com.fintwin.util.PortfolioHistory.Point> months, int funds) {}

    private final InvestmentRepository investments;
    private final HoldingTransactionRepository txns;
    private final UserRepository users;

    @org.springframework.beans.factory.annotation.Autowired
    @org.springframework.beans.factory.annotation.Qualifier("aiRestTemplate")
    private org.springframework.web.client.RestTemplate ai;

    @org.springframework.beans.factory.annotation.Value("${ai.service.url}")
    private String aiUrl;

    public PortfolioHealthService(InvestmentRepository investments, HoldingTransactionRepository txns, UserRepository users) {
        this.investments = investments;
        this.txns = txns;
        this.users = users;
    }

    /** Value over time of the funds that came from a statement; funds whose prices can't be fetched show as 0. */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    @Transactional(readOnly = true)
    public History history() {
        User user = users.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
        List<Investment> mine = investments.findByUser(user);
        Map<Long, List<HoldingTransaction>> lines = transactionsOf(mine);
        var points = com.fintwin.util.PortfolioHistory.of(mine, lines, this::monthlyNavs, LocalDate.now());
        int funds = (int) mine.stream().filter(i -> com.fintwin.util.PortfolioHistory.charted(i, lines.get(i.getId()))).count();
        return new History(points, funds);
    }

    private Map<String, Double> monthlyNavs(String code, java.time.YearMonth from) {
        try {
            List<?> rows = ai.getForObject(aiUrl + "/discover/funds/{code}/monthly?since={since}", List.class, code, from.toString());
            Map<String, Double> out = new java.util.HashMap<>();
            if (rows != null) for (Object o : rows)
                if (o instanceof Map<?, ?> r && r.get("month") != null && r.get("nav") instanceof Number n)
                    out.put(r.get("month").toString(), n.doubleValue());
            return out;
        } catch (RuntimeException e) {
            return Map.of();
        }
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    @Transactional(readOnly = true)
    public Health health() {
        return healthOf(users.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow(), LocalDate.now());
    }

    @Transactional(readOnly = true)
    public Health healthOf(User user, LocalDate today) {
        List<Investment> mine = investments.findByUser(user);
        TaxHarvest.Result tax = TaxHarvest.of(mine, transactionsOf(mine), today);
        return new Health(PortfolioHealth.of(mine, tax, today), tax);
    }

    Map<Long, List<HoldingTransaction>> transactionsOf(List<Investment> mine) {
        if (mine.isEmpty()) return Map.of();
        return txns.findByInvestmentInOrderByDateAsc(mine).stream()
                .collect(Collectors.groupingBy(t -> t.getInvestment().getId()));
    }
}
