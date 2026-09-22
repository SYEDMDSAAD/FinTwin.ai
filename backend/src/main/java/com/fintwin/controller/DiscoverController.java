package com.fintwin.controller;

import com.fintwin.model.IpoListing;
import com.fintwin.service.DiscoverService;
import com.fintwin.service.IpoService;
import com.fintwin.service.WatchlistService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

/** Discover: IPOs, mutual funds, stocks and the user's watchlist. */
@RestController
public class DiscoverController {

    private final DiscoverService discover;
    private final IpoService ipos;
    private final WatchlistService watchlist;

    public DiscoverController(DiscoverService discover, IpoService ipos, WatchlistService watchlist) {
        this.discover = discover;
        this.ipos = ipos;
        this.watchlist = watchlist;
    }

    @GetMapping("/api/v1/discover/ipos")
    public List<Map<String, Object>> ipos() {
        return ipos.forUsers();
    }

    @GetMapping("/api/v1/discover/funds")
    public List<Map<String, Object>> funds(@RequestParam String q) {
        return discover.searchFunds(q);
    }

    @GetMapping("/api/v1/discover/funds/{code}")
    public Map<String, Object> fund(@PathVariable String code) {
        return discover.fund(code);
    }

    @GetMapping("/api/v1/discover/stocks")
    public List<Map<String, Object>> stocks(@RequestParam String q) {
        return discover.searchStocks(q);
    }

    @GetMapping("/api/v1/discover/stocks/quotes")
    public List<Map<String, Object>> quotes(@RequestParam String symbols) {
        return discover.quotes(Arrays.stream(symbols.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList());
    }

    @GetMapping("/api/v1/watchlist")
    public List<Map<String, Object>> watchlist() {
        return watchlist.list();
    }

    @PostMapping("/api/v1/watchlist")
    public Map<String, Object> follow(@RequestBody Map<String, String> body) {
        return watchlist.add(body.get("kind"), body.get("symbol"), body.get("name"));
    }

    @DeleteMapping("/api/v1/watchlist/{id}")
    public ResponseEntity<Void> unfollow(@PathVariable Long id) {
        watchlist.remove(id);
        return ResponseEntity.noContent().build();
    }

    // ── Admin: the IPO catalog ───────────────────────────────────────────────

    @GetMapping("/api/v1/admin/ipos")
    public List<Map<String, Object>> allIpos() {
        return ipos.all();
    }

    @PostMapping("/api/v1/admin/ipos")
    public Map<String, Object> createIpo(@RequestBody IpoListing ipo) {
        return ipos.save(null, ipo);
    }

    @PutMapping("/api/v1/admin/ipos/{id}")
    public Map<String, Object> updateIpo(@PathVariable Long id, @RequestBody IpoListing ipo) {
        return ipos.save(id, ipo);
    }

    @DeleteMapping("/api/v1/admin/ipos/{id}")
    public ResponseEntity<Void> deleteIpo(@PathVariable Long id) {
        ipos.delete(id);
        return ResponseEntity.noContent().build();
    }
}
