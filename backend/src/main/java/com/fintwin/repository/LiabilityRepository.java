package com.fintwin.repository;

import com.fintwin.model.Liability;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LiabilityRepository
        extends JpaRepository<Liability, Long> {

    List<Liability> findByUser(User user);

    void deleteByUser(User user);
}