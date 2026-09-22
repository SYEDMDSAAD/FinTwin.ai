package com.fintwin.repository;

import com.fintwin.model.AnomalyFeedback;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface AnomalyFeedbackRepository extends JpaRepository<AnomalyFeedback, Long> {

    Optional<AnomalyFeedback> findByUserAndPatternKey(User user, String patternKey);

    /** Rows: [anomalyType, severity, verdict, count]. */
    @Query("SELECT f.anomalyType, f.severity, f.verdict, COUNT(f) FROM AnomalyFeedback f "
         + "GROUP BY f.anomalyType, f.severity, f.verdict")
    List<Object[]> countVerdicts();

    @Query("SELECT f FROM AnomalyFeedback f JOIN FETCH f.user u WHERE u.trainingConsentAt IS NOT NULL ORDER BY f.id")
    List<AnomalyFeedback> findConsented();
}
