package com.fintwin.repository;

import com.fintwin.model.SupportTicket;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, Long> {

    List<SupportTicket> findAllByOrderByCreatedAtDesc();

    List<SupportTicket> findByStatusOrderByCreatedAtDesc(String status);

    long countByStatus(String status);
}
