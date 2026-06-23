package com.fintwin.repository;

import com.fintwin.model.Asset;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AssetRepository
        extends JpaRepository<Asset, Long> {

    List<Asset> findByUser(User user);

    void deleteByUser(User user);
}