package com.fintwin.controller;

import com.fintwin.service.ChatService;
import com.fintwin.service.StatementExtractService;
import com.fintwin.service.TransactionService;
import com.fintwin.dto.ExpenseRequest;
import com.fintwin.dto.ChatRequestDTO;
import com.fintwin.dto.TransactionDTO;

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

    @Autowired
    private StatementExtractService statementExtractService;

    @PostMapping("/upload")
    public ResponseEntity<String> uploadCSV(
            @RequestParam("file") MultipartFile file
    ) {
        service.uploadCSV(file);

        return ResponseEntity.ok("CSV Uploaded Successfully");
    }

    @GetMapping
    public List<TransactionDTO> getTransactions() {
        return service.getAllTransactions().stream()
                .map(TransactionDTO::from)
                .toList();
    }

    @PostMapping("/expense")
        public TransactionDTO addExpense(
                @Valid
                @RequestBody
                ExpenseRequest request
        ) {

        return TransactionDTO.from(
                service.addExpenseByText(request.getText())
        );
    }

    @PostMapping("/income")
        public TransactionDTO addIncome(
                @Valid
                @RequestBody
                ExpenseRequest request
        ) {

        return TransactionDTO.from(
                service.addIncomeByText(request.getText())
        );
    }

    @PostMapping("/batch")
    public ResponseEntity<Map<String, Object>> importBatch(
            @RequestBody List<Map<String, Object>> rows,
            @RequestParam(defaultValue = TransactionService.ACCOUNT_BANK) String accountType,
            @RequestParam(required = false) String account) {
        TransactionService.ImportResult result = service.importBatch(rows, accountType, account);
        return ResponseEntity.ok(Map.of(
                "imported",   result.imported(),
                "duplicates", result.duplicates(),
                "skipped",    result.skipped(),
                "reconciled", result.reconciled(),
                "success",    true));
    }

    /**
     * Reads a PDF or Excel statement into a grid for the import page to map
     * and preview. Saves nothing; confirmed rows come back through /batch.
     */
    @PostMapping("/statement/extract")
    public Map<String, Object> extractStatement(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "password", required = false) String password) {
        return statementExtractService.extract(file, password);
    }

    @PostMapping("/manual")
    public TransactionDTO addManual(@RequestBody Map<String, Object> body) {
        String date     = (String) body.get("date");
        String merchant = (String) body.get("merchant");
        Double amount   = body.get("amount") instanceof Number
                ? ((Number) body.get("amount")).doubleValue() : 0.0;
        String category = (String) body.get("category");
        return TransactionDTO.from(
                service.addManualTransaction(date, merchant, amount, category));
    }

    @PatchMapping("/{id}/category")
    public ResponseEntity<Map<String, Object>> updateCategory(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        String category = body.get("category") != null
                ? body.get("category").toString() : null;
        boolean applyToSimilar = Boolean.TRUE.equals(body.get("applyToSimilar"));
        // "remember" defaults to true — the learned rule is the whole point
        boolean remember = !Boolean.FALSE.equals(body.get("remember"));

        return ResponseEntity.ok(
                service.updateCategory(id, category, applyToSimilar, remember));
    }

    @PostMapping("/upload-screenshot")
    public TransactionDTO uploadScreenshot(
            @RequestParam("file")
            MultipartFile file
    ) {

        return TransactionDTO.from(service.uploadScreenshot(file));
    }

    @PostMapping("/chat")
    public ResponseEntity<Map<String, Object>> chat(
            @Valid @RequestBody ChatRequestDTO body
    ) {
        try {
            Map<String, Object> result = chatService.chat(body.getMessage(), body.getMode());
            Map<String, Object> response = new java.util.HashMap<>(result);
            response.put("success", true);
            return ResponseEntity.ok(response);
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

    @DeleteMapping("/chat/history/{id}")
    public ResponseEntity<?> deleteChatMessage(@PathVariable Long id) {
        chatService.deleteChatMessage(id);
        return ResponseEntity.ok(Map.of("success", true));
    }

}