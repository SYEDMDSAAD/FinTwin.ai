package com.fintwin.controller;

import com.fintwin.dto.NotificationDTO;

import com.fintwin.service
    .NotificationService;

import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController

@RequestMapping("/api/notifications")


public class NotificationController {

    private final NotificationService
        notificationService;

    public NotificationController(

        NotificationService
            notificationService

    ) {

        this.notificationService =
            notificationService;
    }

    // =====================================
    // GET NOTIFICATIONS
    // =====================================

    @GetMapping

    public List<NotificationDTO>
    getNotifications() {

        return notificationService
            .generateNotifications();
    }

    // =====================================
    // DELETE NOTIFICATION
    // =====================================

    @DeleteMapping("/{index}")

    public void deleteNotification(

        @PathVariable int index

    ) {

        notificationService
            .deleteNotification(index);
    }

    // =====================================
    // MARK AS READ
    // =====================================

    @PutMapping("/{index}/read")

    public void markAsRead(

        @PathVariable int index

    ) {

        notificationService
            .markAsRead(index);
    }

    // =====================================
    // FORCE REGENERATE
    // =====================================

    @PostMapping("/refresh")

    public List<NotificationDTO>
    refreshNotifications() {

        return notificationService
            .generateNotifications();
    }
}