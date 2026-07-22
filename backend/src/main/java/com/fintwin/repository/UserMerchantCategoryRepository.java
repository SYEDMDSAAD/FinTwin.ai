package com.fintwin.repository;

import com.fintwin.model.User;
import com.fintwin.model.UserMerchantCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserMerchantCategoryRepository
        extends JpaRepository<UserMerchantCategory, Long> {

    List<UserMerchantCategory> findByUser(User user);

    Optional<UserMerchantCategory> findByUserAndMerchantPattern(User user, String merchantPattern);
}
