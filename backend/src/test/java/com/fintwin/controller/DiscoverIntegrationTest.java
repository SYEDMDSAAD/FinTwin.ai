package com.fintwin.controller;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.*;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** IPO catalog and watchlist through the real security chain and database. */
class DiscoverIntegrationTest extends AbstractIntegrationTest {

    private HttpEntity<Object> json(String token, Object body) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, h);
    }

    @Test
    void onlyAdminsEditTheCatalogAndUsersSeeWhatTheyAdd() {
        String admin = seedAdminAndGetToken("ipo-admin@example.com", "Test@1234");
        String user = seedUserAndGetToken("ipo-user@example.com", "Test@1234");
        Map<String, Object> ipo = Map.of("name", "Integration Test Ltd", "category", "Mainboard",
                "priceBandLow", 95, "priceBandHigh", 100, "lotSize", 150,
                "openDate", "2099-01-10", "closeDate", "2099-01-14");

        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/admin/ipos", HttpMethod.POST, json(user, ipo), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        ResponseEntity<Map> created = restTemplate.exchange(baseUrl() + "/api/v1/admin/ipos", HttpMethod.POST, json(admin, ipo), Map.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(created.getBody()).containsEntry("status", "UPCOMING");

        ResponseEntity<List> seen = restTemplate.exchange(baseUrl() + "/api/v1/discover/ipos", HttpMethod.GET, json(user, null), List.class);
        assertThat(seen.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat((List<Map<String, Object>>) seen.getBody()).anySatisfy(m -> {
            assertThat(m).containsEntry("name", "Integration Test Ltd");
            assertThat(((Number) m.get("minInvestment")).intValue()).isEqualTo(15000);
        });
    }

    @Test
    void aUserFollowsAndUnfollowsAStock() {
        String user = seedUserAndGetToken("watch-user@example.com", "Test@1234");
        Map<String, String> item = Map.of("kind", "STOCK", "symbol", "hdfcbank.ns", "name", "HDFC Bank");

        Map first = restTemplate.exchange(baseUrl() + "/api/v1/watchlist", HttpMethod.POST, json(user, item), Map.class).getBody();
        Map again = restTemplate.exchange(baseUrl() + "/api/v1/watchlist", HttpMethod.POST, json(user, item), Map.class).getBody();
        assertThat(again.get("id")).isEqualTo(first.get("id"));           // following twice is a no-op
        assertThat(first).containsEntry("symbol", "HDFCBANK.NS");

        List list = restTemplate.exchange(baseUrl() + "/api/v1/watchlist", HttpMethod.GET, json(user, null), List.class).getBody();
        assertThat(list).hasSize(1);

        restTemplate.exchange(baseUrl() + "/api/v1/watchlist/" + first.get("id"), HttpMethod.DELETE, json(user, null), Void.class);
        assertThat(restTemplate.exchange(baseUrl() + "/api/v1/watchlist", HttpMethod.GET, json(user, null), List.class).getBody()).isEmpty();
    }

    @Test
    void anotherUsersWatchlistItemCantBeRemoved() {
        String owner = seedUserAndGetToken("watch-owner@example.com", "Test@1234");
        String other = seedUserAndGetToken("watch-other@example.com", "Test@1234");
        Map created = restTemplate.exchange(baseUrl() + "/api/v1/watchlist", HttpMethod.POST,
                json(owner, Map.of("kind", "FUND", "symbol", "122640", "name", "Parag Parikh Flexi Cap")), Map.class).getBody();

        ResponseEntity<String> resp = restTemplate.exchange(baseUrl() + "/api/v1/watchlist/" + created.get("id"),
                HttpMethod.DELETE, json(other, null), String.class);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }
}
