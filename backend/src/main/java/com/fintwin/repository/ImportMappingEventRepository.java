package com.fintwin.repository;

import com.fintwin.model.ImportMappingEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ImportMappingEventRepository extends JpaRepository<ImportMappingEvent, Long> {

    List<ImportMappingEvent> findAllByOrderByCreatedAtDesc();

    @Query("SELECT e FROM ImportMappingEvent e JOIN FETCH e.user u WHERE u.trainingConsentAt IS NOT NULL ORDER BY e.id")
    List<ImportMappingEvent> findConsented();
}
