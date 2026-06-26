package com.fintwin.controller;

import com.fintwin.model.Transaction;
import com.fintwin.service.ChatService;
import com.fintwin.service.TransactionService;
import com.fintwin.dto.ExpenseRequest;
import com.fintwin.dto.ChatRequestDTO;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import jakarta.validation.Valid;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/v1/transactions")
public class TransactionController {

    @Autowired
    private TransactionService service;

    @Autowired
    private ChatService chatService;

    @PostMapping("/upload")
    public ResponseEntity<String> uploadCSV(
            @RequestParam("file") MultipartFile file
    ) {
        service.uploadCSV(file);

        return ResponseEntity.ok("CSV Uploaded Successfully");
    }

    @GetMapping
    public List<Transaction> getTransactions() {
        return service.getAllTransactions();
    }

    @PostMapping("/expense")
        public Transaction addExpense(
                @Valid
                @RequestBody
                ExpenseRequest request
        ) {

        return service.addExpenseByText(
                request.getText()
        );
    }

    @PostMapping("/income")
        public Transaction addIncome(
                @Valid
                @RequestBody
                ExpenseRequest request
        ) {

        return service.addIncomeByText(
                request.getText()
        );
    }

    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> importBatch(
            @RequestBody List<Map<String, Object>> rows) {
        int count = service.importBatch(rows);
        return ResponseEntity.ok(Map.of("imported", count, "success", true));
    }

    @PostMapping("/manual")
    public Transaction addManual(@RequestBody Map<String, Object> body) {
        String date     = (String) body.get("date");
        String merchant = (String) body.get("merchant");
        Double amount   = body.get("amount") instanceof Number
                ? ((Number) body.get("amount")).doubleValue() : 0.0;
        String category = (String) body.get("category");
        return service.addManualTransaction(date, merchant, amount, category);
    }

    @PostMapping("/upload-screenshot")

    public Transaction uploadScreenshot(
            @RequestParam("file")
            MultipartFile file
    ) {

        return service.uploadScreenshot(file);
    }

    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(
            @Valid @RequestBody ChatRequestDTO body
    ) {
        try {
            String reply = chatService.chat(body.getMessage(), body.getMode());
            return ResponseEntity.ok(Map.of("success", true, "reply", reply));
        } catch (Exception e) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false, "reply", "FinTwin AI unavailable."));
        }
    }

    @GetMapping("/chat/history")
    public ResponseEntity<?> getChatHistory() {
        try {
            return ResponseEntity.ok(chatService.getChatHistory());
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @DeleteMapping("/chat/history")
    public ResponseEntity<?> clearChatHistory() {
        try {
            chatService.clearChatHistory();
            return ResponseEntity.ok(Map.of("success", true));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

}