package com.fintwin.service;

import com.fintwin.exception.NotFoundException;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.CoverageMath;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Per-account view of how complete the user's data is ("Your data" panel). */
@Service
public class DataCoverageService {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final UserRepository users;
    private final TransactionRepository transactions;

    public DataCoverageService(UserRepository users, TransactionRepository transactions) {
        this.users = users;
        this.transactions = transactions;
    }

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    public List<Map<String, Object>> coverage() {
        User user = users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
        LocalDate today = LocalDate.now(IST);
        return CoverageMath.coverage(transactions.findByUser(user), today).stream()
                .map(c -> toView(c, today))
                .toList();
    }

    private static Map<String, Object> toView(CoverageMath.AccountCoverage c, LocalDate today) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("account", c.account());
        m.put("card", c.card());
        m.put("status", c.status().name());
        m.put("lastTransaction", c.lastTransaction());
        m.put("statementsUpTo", c.statementsUpTo());
        m.put("lastAlert", c.lastAlert());
        m.put("missingMonths", c.missingMonths().stream()
                .map(ym -> CoverageMath.monthName(ym, today)).toList());
        return m;
    }
}
