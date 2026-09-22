package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.User;
import com.fintwin.model.WatchlistItem;
import com.fintwin.repository.UserRepository;
import com.fintwin.repository.WatchlistItemRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Stocks and funds the user follows on Discover. */
@Service
public class WatchlistService {

    static final int MAX_ITEMS = 50;

    private final WatchlistItemRepository repo;
    private final UserRepository users;

    public WatchlistService(WatchlistItemRepository repo, UserRepository users) {
        this.repo = repo;
        this.users = users;
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<Map<String, Object>> list() {
        return repo.findByUserOrderByCreatedAtAsc(currentUser()).stream().map(WatchlistService::view).toList();
    }

    /** Adding something already followed is a no-op, not an error. */
    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public Map<String, Object> add(String kindRaw, String symbolRaw, String nameRaw) {
        User user = currentUser();
        WatchlistItem.Kind kind;
        try {
            kind = WatchlistItem.Kind.valueOf(String.valueOf(kindRaw).trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new BadRequestException("Kind must be STOCK or FUND");
        }
        String symbol = symbolRaw == null ? "" : symbolRaw.trim().toUpperCase();
        if (symbol.isEmpty() || symbol.length() > 40
                || (kind == WatchlistItem.Kind.FUND && !symbol.matches("\\d{1,10}"))
                || (kind == WatchlistItem.Kind.STOCK && !symbol.matches("[A-Z0-9&._-]+"))) {
            throw new BadRequestException("That isn't a valid " + kind.name().toLowerCase() + " symbol");
        }
        String name = nameRaw == null || nameRaw.isBlank() ? symbol : nameRaw.trim();
        if (name.length() > 200) name = name.substring(0, 200);

        var existing = repo.findByUserAndKindAndSymbol(user, kind, symbol);
        if (existing.isPresent()) return view(existing.get());
        if (repo.findByUserOrderByCreatedAtAsc(user).size() >= MAX_ITEMS) {
            throw new BadRequestException("Your watchlist is full (" + MAX_ITEMS + " items). Remove one first.");
        }
        return view(repo.save(new WatchlistItem(user, kind, symbol, name)));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    @Transactional
    public void remove(Long id) {
        User user = currentUser();
        WatchlistItem item = repo.findById(id)
                .filter(i -> i.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> new NotFoundException("Not on your watchlist"));
        repo.delete(item);
    }

    private static Map<String, Object> view(WatchlistItem i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", i.getId());
        m.put("kind", i.getKind().name());
        m.put("symbol", i.getSymbol());
        m.put("name", i.getName());
        return m;
    }

    private User currentUser() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
    }
}
