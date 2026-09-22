package com.fintwin.repository;

import com.fintwin.model.User;
import com.fintwin.model.WatchlistItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface WatchlistItemRepository extends JpaRepository<WatchlistItem, Long> {

    List<WatchlistItem> findByUserOrderByCreatedAtAsc(User user);

    Optional<WatchlistItem> findByUserAndKindAndSymbol(User user, WatchlistItem.Kind kind, String symbol);
}
