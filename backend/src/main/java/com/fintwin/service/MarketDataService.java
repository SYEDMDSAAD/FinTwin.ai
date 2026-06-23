package com.fintwin.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Owns all Yahoo Finance communication: crumb management, cookie handling,
 * quote fetching, and response parsing.
 */
@Service
public class MarketDataService {

    private static final Logger log = LoggerFactory.getLogger(MarketDataService.class);

    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    private final CookieManager cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
    private final HttpClient http = HttpClient.newBuilder()
            .cookieHandler(cookieManager)
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicReference<String> crumb = new AtomicReference<>();

    public List<Map<String, Object>> getQuotes(String symbols) {
        ensureCrumb();

        List<Map<String, Object>> results = new ArrayList<>();
        for (String sym : symbols.split(",")) {
            String symbol = sym.trim();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("symbol", symbol);
            try {
                String encoded = URLEncoder.encode(symbol, StandardCharsets.UTF_8);
                HttpResponse<String> resp = fetchQuote(encoded);

                if (resp.statusCode() == 401 || resp.statusCode() == 403) {
                    crumb.set(fetchCrumb());
                    resp = fetchQuote(encoded);
                }

                parseQuoteInto(item, resp.body());
            } catch (Exception e) {
                log.warn("Failed to fetch quote for {}: {}", symbol, e.getMessage());
            }
            results.add(item);
        }
        return results;
    }

    private void ensureCrumb() {
        if (crumb.get() == null) {
            try { crumb.set(fetchCrumb()); } catch (Exception e) {
                log.warn("Could not fetch Yahoo crumb: {}", e.getMessage());
            }
        }
    }

    private String fetchCrumb() throws Exception {
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("https://query2.finance.yahoo.com/v1/test/getcrumb"))
                .header("User-Agent", UA)
                .header("Accept", "*/*")
                .GET().build();
        return http.send(req, HttpResponse.BodyHandlers.ofString()).body().trim();
    }

    private HttpResponse<String> fetchQuote(String encodedSymbol) throws Exception {
        String crumbParam = crumb.get() != null
                ? "&crumb=" + URLEncoder.encode(crumb.get(), StandardCharsets.UTF_8)
                : "";
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create("https://query1.finance.yahoo.com/v8/finance/chart/"
                        + encodedSymbol + "?interval=1d&range=1d" + crumbParam))
                .header("User-Agent", UA)
                .header("Accept", "application/json")
                .GET().build();
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    @SuppressWarnings("unchecked")
    private void parseQuoteInto(Map<String, Object> item, String json) throws Exception {
        Map<?, ?> body      = mapper.readValue(json, Map.class);
        Map<?, ?> chart     = (Map<?, ?>) body.get("chart");
        List<?> resultList  = chart != null ? (List<?>) chart.get("result") : null;
        if (resultList == null || resultList.isEmpty()) return;

        Map<?, ?> meta = (Map<?, ?>) ((Map<?, ?>) resultList.get(0)).get("meta");
        if (meta == null) return;

        double price = toDouble(meta.get("regularMarketPrice"));
        double prev  = toDouble(meta.get("chartPreviousClose"));
        item.put("price",      price);
        item.put("previousClose", prev);
        item.put("change",     price - prev);
        item.put("changePct",  prev != 0 ? (price - prev) / prev * 100 : 0.0);
    }

    private double toDouble(Object val) {
        if (val instanceof Number n) return n.doubleValue();
        return 0.0;
    }
}
