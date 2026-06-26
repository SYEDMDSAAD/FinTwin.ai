package com.fintwin.controller;

import com.fintwin.dto.CreditScoreDTO;
import com.fintwin.service.CreditScoreService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/credit-score")
public class CreditScoreController {

    @Autowired private CreditScoreService creditScoreService;

    @GetMapping
    public ResponseEntity<CreditScoreDTO> getCreditScore() {
        return ResponseEntity.ok(creditScoreService.calculate());
    }
}
