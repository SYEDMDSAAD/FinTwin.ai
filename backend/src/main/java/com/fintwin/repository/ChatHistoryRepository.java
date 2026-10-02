package com.fintwin.repository;

import com.fintwin.model.ChatHistory;
import com.fintwin.model.User;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatHistoryRepository

extends JpaRepository<
    ChatHistory,
    Long
> {

    List<ChatHistory>
    findTop10ByUserOrderByTimestampDesc(
            User user
    );

    List<ChatHistory>
    findAllByUserOrderByTimestampAsc(
            User user
    );

    long countByUser(User user);

    void deleteByUser(User user);


    // The shared demo account keeps each visitor's chat apart by session
    List<ChatHistory> findTop10ByUserAndDemoSessionOrderByTimestampDesc(User user, String demoSession);

    List<ChatHistory> findAllByUserAndDemoSessionOrderByTimestampAsc(User user, String demoSession);

    long countByDemoSession(String demoSession);

    void deleteByUserAndDemoSession(User user, String demoSession);
}
