package com.fintwin.repository;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface TransactionRepository
        extends JpaRepository<Transaction, Long> {

    List<Transaction> findByUser(User user);

    Optional<Transaction> findByUserAndExternalId(User user, String externalId);

    @Query("SELECT t.externalId FROM Transaction t WHERE t.user = :user AND t.externalId IS NOT NULL")
    Set<String> findExternalIdsByUser(@Param("user") User user);

    long countByUser(User user);

    /** Transactions with a recorded categorisation, from users who opted in to training. */
    @Query("SELECT t FROM Transaction t JOIN FETCH t.user u WHERE u.trainingConsentAt IS NOT NULL "
         + "AND t.categorySource IS NOT NULL ORDER BY t.id")
    List<Transaction> findConsentedLabelled();

    /**
     * Categorisation labels counted by channel, method (categorySource)
     * and what the user did (categoryReview), with whether the owner has opted
     * in to training. Rows: [channel, categorySource, categoryReview, consented, count].
     */
    // Channel "AA" = the Account Aggregator: bank rows, and card rows whose
    // external id is a Setu txnId ("CARD:…"); card statements and alert
    // emails share source CARD but carry STMT:/MAIL: ids.
    @Query("SELECT CASE WHEN t.source = 'BANK' OR t.externalId LIKE 'CARD:%' THEN 'AA' ELSE t.source END, "
         + "t.categorySource, t.categoryReview, "
         + "CASE WHEN t.user.trainingConsentAt IS NULL THEN false ELSE true END, COUNT(t) "
         + "FROM Transaction t GROUP BY "
         + "CASE WHEN t.source = 'BANK' OR t.externalId LIKE 'CARD:%' THEN 'AA' ELSE t.source END, "
         + "t.categorySource, t.categoryReview, "
         + "CASE WHEN t.user.trainingConsentAt IS NULL THEN false ELSE true END")
    List<Object[]> countCategoryLabels();

    long countByUserAndSource(User user, String source);

    void deleteByUser(User user);

    @Query("SELECT t FROM Transaction t WHERE t.user = :user AND (t.source = 'SEED' OR t.source IS NULL)")
    List<Transaction> findSeededByUser(@Param("user") User user);

    @Query("SELECT t FROM Transaction t WHERE t.user.id = :userId AND t.date >= :cutoff ORDER BY t.date ASC")
    List<Transaction> findLatestThreeMonthsTransactions(@Param("userId") Long userId, @Param("cutoff") java.time.LocalDate cutoff);

    /**
     * Same query under an honest name, for callers that need a window other than
     * three months — recurring-charge detection needs a year to see an annual
     * subscription bill even once.
     */
    default List<Transaction> findSince(Long userId, java.time.LocalDate cutoff) {
        return findLatestThreeMonthsTransactions(userId, cutoff);
    }

    @Query("SELECT MAX(t.date) FROM Transaction t WHERE t.user.id = :userId")
    java.time.LocalDate latestTransactionDate(@Param("userId") Long userId);

    /**
     * Where a "recent months" window starts for this user. Anchored on their
     * newest transaction, not on today: a statement imported months after the
     * fact ends in the past, and a window hung off today's date would be empty
     * — every figure zero, and the copilot asking the user for numbers it
     * already has. A user whose data reaches today is unaffected.
     */
    default java.time.LocalDate recentCutoff(Long userId, int months) {
        java.time.LocalDate today = java.time.LocalDate.now();
        java.time.LocalDate latest = latestTransactionDate(userId);
        java.time.LocalDate anchor = latest == null || latest.isAfter(today) ? today : latest;
        return anchor.minusMonths(Math.max(1, months) - 1L).withDayOfMonth(1);
    }

    default List<Transaction> findLatestThreeMonthsTransactions(Long userId) {
        return findLatestThreeMonthsTransactions(userId, recentCutoff(userId, 3));
    }
}