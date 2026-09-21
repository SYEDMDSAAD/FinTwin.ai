package com.fintwin.repository;

import com.fintwin.model.EmailIngestEvent;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface EmailIngestEventRepository extends JpaRepository<EmailIngestEvent, Long> {

    List<EmailIngestEvent> findTop20ByUserOrderByReceivedAtDesc(User user);

    List<EmailIngestEvent> findByUserAndStatus(User user, EmailIngestEvent.Status status);
}
