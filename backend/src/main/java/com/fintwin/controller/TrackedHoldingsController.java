package com.fintwin.controller;

import com.fintwin.dto.TrackedHoldingsDTO.*;
import com.fintwin.service.TrackedHoldingsService;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** SIPs, US holdings and the fund watchlist, kept in the account rather than on one device. */
@RestController
@RequestMapping("/api/v1")
public class TrackedHoldingsController {

    private final TrackedHoldingsService service;

    public TrackedHoldingsController(TrackedHoldingsService service) {
        this.service = service;
    }

    @GetMapping("/sips")
    public List<Sip> sips() { return service.listSips(); }

    @PostMapping("/sips")
    public Sip createSip(@RequestBody Sip body) { return service.createSip(body); }

    @PutMapping("/sips/{id}")
    public Sip updateSip(@PathVariable Long id, @RequestBody Sip body) { return service.updateSip(id, body); }

    @DeleteMapping("/sips/{id}")
    public ResponseEntity<Void> deleteSip(@PathVariable Long id) {
        service.deleteSip(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/us-holdings")
    public List<UsStock> usHoldings() { return service.listUsHoldings(); }

    @PostMapping("/us-holdings")
    public UsStock createUsHolding(@RequestBody UsStock body) { return service.createUsHolding(body); }

    @DeleteMapping("/us-holdings/{id}")
    public ResponseEntity<Void> deleteUsHolding(@PathVariable Long id) {
        service.deleteUsHolding(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/fund-watchlist")
    public List<WatchedFund> watchlist() { return service.listWatchlist(); }

    @PostMapping("/fund-watchlist")
    public WatchedFund watch(@RequestBody WatchedFund body) { return service.watch(body); }

    @DeleteMapping("/fund-watchlist/{schemeCode}")
    public ResponseEntity<Void> unwatch(@PathVariable String schemeCode) {
        service.unwatch(schemeCode);
        return ResponseEntity.noContent().build();
    }

    /** One-time move of what this browser had saved locally. */
    @PostMapping("/device-data/import")
    public ImportResult importFromDevice(@RequestBody DeviceImport body) { return service.importFromDevice(body); }
}
