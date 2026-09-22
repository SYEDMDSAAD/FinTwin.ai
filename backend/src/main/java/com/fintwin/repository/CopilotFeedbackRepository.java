package com.fintwin.repository;

import com.fintwin.model.CopilotFeedback;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CopilotFeedbackRepository extends JpaRepository<CopilotFeedback, Long> {

    Optional<CopilotFeedback> findByUserAndExchangeId(User user, Long exchangeId);

    void deleteByUserAndExchangeId(User user, Long exchangeId);

    void deleteByUser(User user);

    /** Rows: [path, rating, reason, count]. */
    @Query("SELECT f.path, f.rating, f.reason, COUNT(f) FROM CopilotFeedback f GROUP BY f.path, f.rating, f.reason")
    List<Object[]> countByPathRatingReason();

    /** Recent unhelpful answers from users who opted in to their use for improving the AI. */
    @Query("SELECT f FROM CopilotFeedback f WHERE f.rating < 0 AND f.user.trainingConsentAt IS NOT NULL "
         + "ORDER BY f.createdAt DESC")
    List<CopilotFeedback> findConsentedDownvotes(org.springframework.data.domain.Pageable page);
}
