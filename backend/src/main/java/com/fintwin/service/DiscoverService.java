package com.fintwin.service;

import com.fintwin.exception.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.List;
import java.util.Map;

/**
 * Market facts for the Discover page — funds (AMFI) and stocks (NSE/BSE) —
 * fetched through the AI service, which holds the data sources and caches.
 * Shows NAVs, prices and past returns; recommends nothing.
 */
@Service
public class DiscoverService {

    private static final Logger log = LoggerFactory.getLogger(DiscoverService.class);
    private static final ParameterizedTypeReference<List<Map<String, Object>>> LIST = new ParameterizedTypeReference<>() {};

    private final RestTemplate ai;
    private final String aiUrl;

    public DiscoverService(@Qualifier("aiRestTemplate") RestTemplate ai,
                           @Value("${ai.service.url}") String aiUrl) {
        this.ai = ai;
        this.aiUrl = aiUrl;
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<Map<String, Object>> searchFunds(String query) {
        return getList("/discover/funds/search", "q", query);
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public Map<String, Object> fund(String code) {
        if (code == null || !code.matches("\\d{1,10}")) {
            throw new com.fintwin.exception.BadRequestException("Scheme code must be numeric");
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = ai.getForObject(aiUrl + "/discover/funds/" + code, Map.class);
            return m;
        } catch (HttpClientErrorException.NotFound e) {
            throw new com.fintwin.exception.NotFoundException("Unknown scheme code");
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<Map<String, Object>> searchStocks(String query) {
        return getList("/discover/stocks/search", "q", query);
    }

    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<Map<String, Object>> quotes(List<String> symbols) {
        if (symbols == null || symbols.isEmpty()) return List.of();
        return getList("/discover/stocks/quotes", "symbols", String.join(",", symbols));
    }

    private static final java.util.regex.Pattern CODE = java.util.regex.Pattern.compile("\\d{1,10}");
    private static final java.util.Set<String> FUND_RANGES = java.util.Set.of("1M", "6M", "1Y", "3Y", "5Y", "ALL");
    private static final java.util.Set<String> STOCK_RANGES = java.util.Set.of("1D", "1W", "1M", "1Y", "5Y");

    private static void requireCode(String code) {
        if (code == null || !CODE.matcher(code).matches()) {
            throw new com.fintwin.exception.BadRequestException("Scheme code must be numeric");
        }
    }

    private static String range(String r, java.util.Set<String> allowed) {
        String v = r == null ? "1Y" : r.toUpperCase();
        if (!allowed.contains(v)) throw new com.fintwin.exception.BadRequestException("Unknown range");
        return v;
    }

    /** NAVs over a range for the fund page's chart: {code, range, since, change, points[]}. */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public Map<String, Object> fundHistory(String code, String r) {
        requireCode(code);
        return getMap(aiUrl + "/discover/funds/" + code + "/history?range=" + range(r, FUND_RANGES), "Unknown scheme code");
    }

    /** The daily NAV series, for the returns calculator. */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<Map<String, Object>> fundNavs(String code) {
        requireCode(code);
        try {
            List<Map<String, Object>> body = ai.exchange(aiUrl + "/discover/funds/" + code + "/navs", HttpMethod.GET, null, LIST).getBody();
            return body == null ? List.of() : body;
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    /** Prices over a range for the stock page, with the 52-week high and low. */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public Map<String, Object> stockHistory(String symbol, String r) {
        if (symbol == null || !symbol.matches("[A-Za-z0-9&.\\-]{1,40}")) {
            throw new com.fintwin.exception.BadRequestException("Unknown symbol");
        }
        return getMap(UriComponentsBuilder.fromHttpUrl(aiUrl + "/discover/stocks/history")
                .queryParam("symbol", symbol).queryParam("range", range(r, STOCK_RANGES)).build().toUriString(),
                "No price history for that stock");
    }

    /** Each stock's sector, for the sector split: {SYMBOL.NS: "Technology" | null}. */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public Map<String, Object> stockSectors(List<String> symbols) {
        if (symbols == null || symbols.isEmpty()) return Map.of();
        for (String s : symbols) {
            if (!s.matches("[A-Za-z0-9&.\\-]{1,40}")) throw new com.fintwin.exception.BadRequestException("Unknown symbol");
        }
        return getMap(UriComponentsBuilder.fromHttpUrl(aiUrl + "/discover/stocks/sectors")
                .queryParam("symbols", String.join(",", symbols.subList(0, Math.min(50, symbols.size())))).build().toUriString(),
                "No sectors found");
    }

    /** The collections: plain filters on AMFI categories. */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public List<Map<String, Object>> fundCollections() {
        try {
            List<Map<String, Object>> body = ai.exchange(aiUrl + "/discover/funds/collections", HttpMethod.GET, null, LIST).getBody();
            return body == null ? List.of() : body;
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    /** One collection, sorted by a stated column, never "recommended". */
    @PreAuthorize("hasAuthority('READ_OWN_INVESTMENTS')")
    public Map<String, Object> fundCollection(String key) {
        if (key == null || !key.matches("[a-z\\-]{2,20}")) {
            throw new com.fintwin.exception.NotFoundException("Unknown collection");
        }
        return getMap(aiUrl + "/discover/funds/collections/" + key, "Unknown collection");
    }

    // ── Prices for valuing a holding: on its purchase date, and today ─────────

    /** Close on the date or the next trading day: {symbol, date, price}. */
    public Map<String, Object> stockPriceOn(String symbol, java.time.LocalDate date) {
        return getMap(UriComponentsBuilder.fromHttpUrl(aiUrl + "/discover/stocks/price-on")
                .queryParam("symbol", symbol).queryParam("date", date).build().toUriString(),
                "No price found for that stock around that date");
    }

    /** NAV on the date or the next business day: {code, date, nav}. */
    public Map<String, Object> fundNavOn(String code, java.time.LocalDate date) {
        return getMap(UriComponentsBuilder.fromHttpUrl(aiUrl + "/discover/funds/" + code + "/nav-on")
                .queryParam("date", date).build().toUriString(),
                "No NAV found for that fund around that date");
    }

    /** Today's NAV: {code, name, nav, date}. */
    public Map<String, Object> fundLatest(String code) {
        return getMap(aiUrl + "/discover/funds/" + code + "/latest", "Unknown scheme code");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> getMap(String url, String notFound) {
        try {
            Map<String, Object> m = ai.getForObject(url, Map.class);
            if (m == null) throw new com.fintwin.exception.NotFoundException(notFound);
            return m;
        } catch (HttpClientErrorException.NotFound e) {
            throw new com.fintwin.exception.NotFoundException(notFound);
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    private List<Map<String, Object>> getList(String path, String param, String value) {
        if (value == null || value.trim().length() < 2) return List.of();
        String url = UriComponentsBuilder.fromHttpUrl(aiUrl + path).queryParam(param, value.trim())
                .build().toUriString();
        try {
            List<Map<String, Object>> body = ai.exchange(url, HttpMethod.GET, null, LIST).getBody();
            return body == null ? List.of() : body;
        } catch (RestClientException e) {
            throw unavailable(e);
        }
    }

    private static ApiException unavailable(RestClientException e) {
        log.warn("Discover data unavailable: {}", e.getClass().getSimpleName());
        return new ApiException(HttpStatus.BAD_GATEWAY, "Market data is unavailable right now. Try again shortly.",
                "market_unavailable");
    }
}
