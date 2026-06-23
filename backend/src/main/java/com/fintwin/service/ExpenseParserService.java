package com.fintwin.service;

import com.fintwin.model.Transaction;
import org.springframework.stereotype.Service;

@Service
public class ExpenseParserService {

    public Transaction parseExpense(
            String input
    ) {

        input = input.toLowerCase();

        String[] parts = input.split(" ");

        double amount = 0;

        String merchant = "Unknown";

        for (String part : parts) {

            try {

                amount = Double.parseDouble(part);

            } catch (Exception ignored) {

            }
        }

        merchant =
            parts[0].substring(0, 1).toUpperCase()
            + parts[0].substring(1);

        Transaction transaction =
                new Transaction();

        transaction.setMerchant(merchant);

        transaction.setAmount(-amount);

        transaction.setDate(
                java.time.LocalDate.now().toString()
        );

        return transaction;
    }
}