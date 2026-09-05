package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.dto.DailyRecapDTO;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import com.fintwin.util.RecurringMath;
import com.fintwin.util.SpendingRecap;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * The daily view: what has been spent since the user last looked, across every
 * connected account, in sentences.
 *
 * Reading the recap does not mark it read. A GET that mutated state would make
 * a page refresh wipe the very thing the user came to see, and would make the
 * endpoint unsafe to retry. The client marks it seen explicitly once shown.
 */
@Service
public class DailyRecapService {

    /**
     * How much history the "is this normal" comparison is drawn from. Long
     * enough to average out one heavy week, short enough to reflect how the
     * user is living now.
     */
    private static final int BASELINE_DAYS = 90;

    private final TransactionRepository transactionRepository;
    private final UserRepository        userRepository;

    public DailyRecapService(TransactionRepository transactionRepository,
                             UserRepository userRepository) {
        this.transactionRepository = transactionRepository;
        this.userRepository        = userRepository;
    }

    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    @Audited(action = "READ", resource = "daily_recap", description = "User viewed the daily spending recap")
    public DailyRecapDTO getRecap() {
        User user = currentUser();
        LocalDateTime now = LocalDateTime.now();

        LocalDateTime since = user.getLastRecapSeenAt();

        // A first visit has no mark to measure from, so it reaches back a fixed
        // window rather than replaying the user's entire history at them.
        LocalDate windowStart = since != null
                ? since.toLocalDate()
                : now.toLocalDate().minusDays(SpendingRecap.FIRST_VISIT_DAYS);

        // One query covering both the recap window and the comparison baseline.
        LocalDate baselineStart = now.toLocalDate().minusDays(BASELINE_DAYS);
        LocalDate earliest = windowStart.isBefore(baselineStart) ? windowStart : baselineStart;

        List<Transaction> history = transactionRepository.findSince(user.getId(), earliest);

        List<Transaction> window = history.stream()
                .filter(t -> t.getDate() != null && !t.getDate().isBefore(windowStart))
                .toList();

        // The baseline deliberately excludes the window: comparing these few
        // days against an average that already contains them flattens exactly
        // the spike the user should be told about.
        List<Transaction> baseline = history.stream()
                .filter(t -> t.getDate() != null && t.getDate().isBefore(windowStart))
                .toList();

        // Recurring detection needs its own longer reach than the recap window.
        List<RecurringMath.Recurrence> recurring = RecurringMath.detectAll(
                transactionRepository.findSince(
                        user.getId(),
                        now.toLocalDate().minusMonths(RecurringMath.WINDOW_MONTHS).withDayOfMonth(1)),
                now.toLocalDate());

        SpendingRecap.Recap recap =
                SpendingRecap.build(window, baseline, recurring, since, now);

        DailyRecapDTO dto = new DailyRecapDTO();
        dto.setHeadline(recap.headline());
        dto.setPeriodLabel(recap.periodLabel());
        dto.setLines(recap.lines());
        dto.setTotalSpent(recap.totalSpent());
        dto.setChargeCount(recap.chargeCount());
        dto.setFirstVisit(recap.firstVisit());
        dto.setLastSeenAt(since);

        dto.setCharges(SpendingRecap.spendOnly(window).stream()
                .map(t -> new DailyRecapDTO.RecapChargeDTO(
                        t.getMerchant(),
                        Math.abs(t.getAmount()),
                        t.getCategory(),
                        t.getDate(),
                        t.getSource()))
                .toList());

        LocalDate horizon = now.toLocalDate().plusDays(SpendingRecap.UPCOMING_HORIZON_DAYS);
        dto.setUpcoming(recurring.stream()
                .filter(RecurringMath.Recurrence::active)
                .filter(r -> r.nextChargeDate() != null)
                .filter(r -> !r.nextChargeDate().isAfter(horizon))
                .sorted(java.util.Comparator.comparing(RecurringMath.Recurrence::nextChargeDate))
                .map(r -> new DailyRecapDTO.UpcomingChargeDTO(
                        r.merchant(),
                        r.typicalAmount(),
                        r.nextChargeDate(),
                        r.cadenceLabel()))
                .toList());

        return dto;
    }

    /** Marks the recap read, so the next one starts where this one ended. */
    @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')")
    @Transactional
    public void markSeen() {
        User user = currentUser();
        user.setLastRecapSeenAt(LocalDateTime.now());
        userRepository.save(user);
    }

    private User currentUser() {
        return userRepository.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
    }
}
