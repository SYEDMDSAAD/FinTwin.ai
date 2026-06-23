package com.fintwin.repository;

import com.fintwin.model.Notification;
import com.fintwin.model.User;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository
        extends JpaRepository<Notification, Long> {

    List<Notification> findByUser(User user);
}