package com.fintwin.repository;

import com.fintwin.model.CryptoConnection;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CryptoConnectionRepository extends JpaRepository<CryptoConnection, Long> {
    List<CryptoConnection> findByUser(User user);

    void deleteByUser(User user);
}
