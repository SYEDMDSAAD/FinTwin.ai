package com.fintwin.service;

import com.fintwin.dto.SpendingCoachResponseDTO;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

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
            map.put("date", t.getDate());

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

        ResponseEntity<SpendingCoachResponseDTO>
                response =

                aiRestTemplate.exchange(

                        aiServiceUrl
                                + "/spending-coach",

                        HttpMethod.POST,

                        request,

                        SpendingCoachResponseDTO.class
                );

        return response.getBody();
    }
}