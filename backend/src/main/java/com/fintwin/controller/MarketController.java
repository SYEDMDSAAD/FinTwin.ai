package com.fintwin.controller;

import com.fintwin.service.MarketDataService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/market")
public class MarketController {

    @Autowired
    private MarketDataService marketDataService;

    @GetMapping("/quotes")
    public List<Map<String, Object>> getQuotes(@RequestParam String symbols) {
        return marketDataService.getQuotes(symbols);
    }
}
