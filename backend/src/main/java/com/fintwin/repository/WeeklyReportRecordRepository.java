package com.fintwin.repository;

import com.fintwin.model.User;
import com.fintwin.model.WeeklyReportRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;

public interface WeeklyReportRecordRepository extends JpaRepository<WeeklyReportRecord, Long> {
    Optional<WeeklyReportRecord> findByUserAndWeekStart(User user, LocalDate weekStart);
}
