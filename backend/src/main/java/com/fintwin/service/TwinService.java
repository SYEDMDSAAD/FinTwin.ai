package com.fintwin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.SipPlanRepository;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.TwinMath;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;

/**
 * What the Future Twin page needs: where the user is today and the money a
 * twin would also invest. The projection itself is worked out on the page,
 * where the user picks the assumed return and which habits count.
 */
@Service
public class TwinService {

    public record Twin(double portfolioValue, double sipMonthly, TwinMath.RoundUps roundUps,
                       double pausedThisMonth, double pausedTotal, List<TwinMath.Wish> wishlistReady) {}

    private final UserRepository users;
    private final InvestmentRepository investments;
    private final SipPlanRepository sips;
    private final TransactionRepository transactions;
    private final ObjectMapper mapper = new ObjectMapper();

    @Autowired(required = false)
    private SpendGuardLinks guard;

    public TwinService(UserRepository users, InvestmentRepository investments, SipPlanRepository sips,
                       TransactionRepository transactions) {
        this.users = users;
        this.investments = investments;
        this.sips = sips;
        this.transactions = transactions;
    }

    @Transactional(readOnly = true)
    public Twin twin() {
        return twinOf(users.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow(), LocalDate.now());
    }

    @Transactional(readOnly = true)
    public Twin twinOf(User user, LocalDate today) {
        double value = investments.findByUser(user).stream()
                .mapToDouble(i -> i.getCurrentValue() != null ? i.getCurrentValue()
                        : (i.getInvestedAmount() != null ? i.getInvestedAmount() : 0))
                .sum();
        double sipMonthly = sips.findByUserOrderByCreatedAtAsc(user).stream()
                .filter(s -> s.getAmount() != null)
                .mapToDouble(s -> s.getAmount().doubleValue() / ("Quarterly".equals(s.getFrequency()) ? 3 : 1))
                .sum();
        var roundUps = TwinMath.roundUps(transactions.findSince(user.getId(), today.minusMonths(1).withDayOfMonth(1)), today);

        double pausedMonth = 0, pausedTotal = 0;
        List<TwinMath.Wish> wishes = List.of();
        if (guard != null) {
            Map<String, Object> s = guard.summary(user.getId());
            pausedMonth = number(s.get("savedByPausingThisMonth"));
            pausedTotal = number(s.get("savedByPausingTotal"));
            wishes = readyWishes(user, LocalDateTime.now(ZoneId.of("Asia/Kolkata")));
        }
        return new Twin(Math.round(value), Math.round(sipMonthly), roundUps, pausedMonth, pausedTotal, wishes);
    }

    public List<TwinMath.Wish> readyWishes(User user, LocalDateTime now) {
        if (guard == null) return List.of();
        try {
            JsonNode state = mapper.readTree(guard.loadState(user.getId()).orElse("{}"));
            return TwinMath.readyWishes(state, now);
        } catch (Exception e) {
            return List.of();
        }
    }

    private static double number(Object o) {
        return o instanceof Number n ? n.doubleValue() : 0;
    }
}
