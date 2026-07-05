package com.fintwin.service;

import com.fintwin.dto.SpendingCoachResponseDTO;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;

import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class SpendingCoachService {

    private static final Logger log =
            LoggerFactory.getLogger(SpendingCoachService.class);

    @Autowired
    private TransactionRepository transactionRepository;

    @Autowired
    private UserRepository userRepository;

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    @PreAuthorize("hasAuthority('USE_AI_SPENDING_COACH')")
    public SpendingCoachResponseDTO
    getCoachInsights() {

        String email =
                SecurityUtils.getCurrentUserEmail();

        User user =
                userRepository
                        .findByEmail(email)
                        .orElseThrow();

        List<Transaction> transactions =
                transactionRepository
                        .findLatestThreeMonthsTransactions(user.getId());

        List<Map<String, Object>>
                payloadTransactions =
                new ArrayList<>();

        for (Transaction t : transactions) {

            Map<String, Object> map =
                    new HashMap<>();

            map.put("amount", t.getAmount());
            map.put("category", t.getCategory());
            map.put("merchant", t.getMerchant());
            map.put("date", t.getDate() != null ? t.getDate().toString() : null);

            payloadTransactions.add(map);
        }

        Map<String, Object> body =
                new HashMap<>();

        body.put(
                "transactions",
                payloadTransactions
        );

        HttpHeaders headers =
                new HttpHeaders();

        headers.setContentType(
                MediaType.APPLICATION_JSON
        );

        HttpEntity<Map<String, Object>>
                request =
                new HttpEntity<>(
                        body,
                        headers
                );

        try {
            ResponseEntity<SpendingCoachResponseDTO> response =
                    aiRestTemplate.exchange(
                            aiServiceUrl + "/spending-coach",
                            HttpMethod.POST,
                            request,
                            SpendingCoachResponseDTO.class
                    );
            if (response.getBody() != null) return response.getBody();
        } catch (Exception e) {
            log.warn("AI spending coach unavailable, using statistical fallback: {}",
                    e.getMessage());
        }
        return buildFallback(transactions);
    }

    // Statistical fallback when the AI coach is down — same DTO shape.
    private SpendingCoachResponseDTO buildFallback(List<Transaction> transactions) {

        int months = com.fintwin.util.TransactionMath.monthsPresent(transactions);

        double income   = com.fintwin.util.TransactionMath.income(transactions);
        double expenses = com.fintwin.util.TransactionMath.expenses(transactions);

        // "Leakage": monthly average of small discretionary debits (< ₹500) —
        // the spend that tends to go unnoticed.
        double leakage = transactions.stream()
                .filter(t -> t.getAmount() != null && t.getAmount() < 0
                        && Math.abs(t.getAmount()) < 500)
                .mapToDouble(t -> Math.abs(t.getAmount())).sum() / months;

        double ratio = income > 0 ? expenses / income : 1.0;
        String health = ratio < 0.60 ? "Good"
                      : ratio < 0.85 ? "Fair"
                      : "Needs Attention";

        SpendingCoachResponseDTO dto = new SpendingCoachResponseDTO();
        dto.setSpendingHealth(health);
        dto.setMonthlyLeakage(Math.round(leakage * 100.0) / 100.0);
        dto.setTips(List.of(
                "Review small recurring charges — subscriptions under ₹500 add up fastest.",
                "Set category budgets for your top three spending categories.",
                "Automate a fixed transfer to savings on salary day, before discretionary spending."
        ));
        dto.setCoachMessage(
                "The AI coach is temporarily unavailable — these figures are computed "
                + "from your recent transactions. Check back later for personalised advice.");
        return dto;
    }
}