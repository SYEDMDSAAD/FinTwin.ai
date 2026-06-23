package com.fintwin.repository;

import com.fintwin.model.BlockedIP;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface BlockedIPRepository extends JpaRepository<BlockedIP, Long> {

    Optional<BlockedIP> findByIpAddress(String ipAddress);

    boolean existsByIpAddress(String ipAddress);

    @Query("SELECT b FROM BlockedIP b WHERE b.ipAddress = :ip AND (b.expiresAt IS NULL OR b.expiresAt > :now)")
    Optional<BlockedIP> findActiveBlock(@Param("ip") String ip, @Param("now") LocalDateTime now);

    @Query("SELECT CASE WHEN COUNT(b) > 0 THEN true ELSE false END FROM BlockedIP b WHERE b.ipAddress = :ip AND (b.expiresAt IS NULL OR b.expiresAt > :now)")
    boolean isActivelyBlocked(@Param("ip") String ip, @Param("now") LocalDateTime now);
}
