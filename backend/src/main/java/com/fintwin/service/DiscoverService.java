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
