package com.fintwin.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;

import java.time.LocalDateTime;

/** A stock or mutual fund the user follows on the Discover page. */
@Entity
@Table(name = "watchlist_item",
       uniqueConstraints = @UniqueConstraint(name = "ux_watchlist_user_item", columnNames = {"user_id", "kind", "symbol"}))
public class WatchlistItem {

    public enum Kind { STOCK, FUND }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Kind kind;

    @Column(nullable = false, length = 40)
    private String symbol;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    protected WatchlistItem() {}

    public WatchlistItem(User user, Kind kind, String symbol, String name) {
        this.user = user;
        this.kind = kind;
        this.symbol = symbol;
        this.name = name;
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public Kind getKind() { return kind; }
    public String getSymbol() { return symbol; }
    public String getName() { return name; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
