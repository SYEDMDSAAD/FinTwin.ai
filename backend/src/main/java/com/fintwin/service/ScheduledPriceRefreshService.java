package com.fintwin.service;

import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.UserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.*;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Hourly background job that refreshes current market prices for all users'
 * investments by calling the AI service pricing endpoint.
 *
 * Runs separately from the user-triggered POST /api/portfolio/refresh so that
 * portfolios stay up to date even when users haven't opened the app.
 */
@Service
public class ScheduledPriceRefreshService {

    private static final Logger log = LoggerFactory.getLogger(ScheduledPriceRefreshService.class);

    private final InvestmentRepository investmentRepo;
    private final UserRepository       userRepo;
    private final RestTemplate         aiRestTemplate;
    private final String               aiServiceUrl;

    public ScheduledPriceRefreshService(
            InvestmentRepository investmentRepo,
            UserRepository userRepo,
            @Qualifier("aiRestTemplate") RestTemplate aiRestTemplate,
            @Value("${ai.service.url}") String aiServiceUrl) {
        this.investmentRepo = investmentRepo;
        this.userRepo       = userRepo;
        this.aiRestTemplate = aiRestTemplate;
        this.aiServiceUrl   = aiServiceUrl;
    }

    // Runs once per hour. Initial delay of 5 min to let the app finish startup.
    // Processes users in batches of 100 — never loads all users into memory at once.
    // NOTE: In multi-instance deployments this job runs on every replica.
    // Add ShedLock (net.javacrumbs.shedlock:shedlock-spring) to elect a single runner.
    @Scheduled(initialDelay = 300_000, fixedDelay = 3_600_000)
    public void refreshAllPortfolios() {
        int page = 0;
        final int batchSize = 100;
        int totalUpdated = 0;
        int totalUsers = 0;
        Page<User> userPage;

        do {
            userPage = userRepo.findAll(PageRequest.of(page++, batchSize));
            totalUsers += userPage.getNumberOfElements();
            for (User user : userPage.getContent()) {
                try {
                    totalUpdated += refreshForUser(user);
                } catch (Exception e) {
                    log.warn("Price refresh failed for user #{}: {}", user.getId(), e.getMessage());
                }
            }
        } while (userPage.hasNext());

        if (totalUsers > 0)
            log.info("Scheduled price refresh complete — {} user(s), {} investment(s) updated", totalUsers, totalUpdated);
    }

    int refreshForUser(User user) {
        List<Investment> all = investmentRepo.findByUser(user);
        if (all.isEmpty()) return 0;

        // Build payload for AI pricing service
        List<Map<String, Object>> payload = new ArrayList<>();
        for (Investment inv : all) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",             inv.getId() != null ? inv.getId().toString() : null);
            m.put("type",           inv.getType());
            m.put("tickerCode",     inv.getTickerCode());
            m.put("units",          inv.getUnits());
            m.put("investedAmount", inv.getInvestedAmount());
            m.put("interestRate",   inv.getInterestRate());
            m.put("purchaseDate",   inv.getPurchaseDate() != null ? inv.getPurchaseDate().toString() : null);
            payload.add(m);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        ResponseEntity<List<Map<String, Object>>> resp = aiRestTemplate.exchange(
                aiServiceUrl + "/market/prices",
                HttpMethod.POST,
                new HttpEntity<>(payload, headers),
                new ParameterizedTypeReference<>() {}
        );

        List<Map<String, Object>> updates = resp.getBody();
        if (updates == null) return 0;

        Map<Long, Double> priceMap = new HashMap<>();
        for (Map<String, Object> u : updates) {
            if (u.get("id") != null && u.get("currentValue") != null) {
                priceMap.put(Long.valueOf(u.get("id").toString()),
                             Double.valueOf(u.get("currentValue").toString()));
            }
        }

        int count = 0;
        for (Investment inv : all) {
            Double newVal = priceMap.get(inv.getId());
            if (newVal != null && !newVal.equals(inv.getCurrentValue())) {
                inv.setCurrentValue(newVal);
                investmentRepo.save(inv);
                count++;
            }
        }
        return count;
    }
}
