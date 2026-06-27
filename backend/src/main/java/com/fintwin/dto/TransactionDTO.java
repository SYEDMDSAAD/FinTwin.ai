package com.fintwin.dto;

import com.fintwin.model.Transaction;

/**
 * API representation of a transaction. Mirrors the fields the entity previously
 * serialized (the {@code user} association was already {@code @JsonIgnore}d), so
 * the JSON contract is unchanged — but the API no longer exposes the JPA entity
 * directly, decoupling the wire format from the persistence model.
 */
public record TransactionDTO(
        Long id,
        String date,
        String merchant,
        Double amount,
        String category,
        String source,
        String externalId
) {
    public static TransactionDTO from(Transaction t) {
        return new TransactionDTO(
                t.getId(),
                t.getDate(),
                t.getMerchant(),
                t.getAmount(),
                t.getCategory(),
                t.getSource(),
                t.getExternalId()
        );
    }
}
