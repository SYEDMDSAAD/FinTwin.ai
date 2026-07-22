package com.fintwin.dto;

import com.fintwin.model.Liability;

/** API representation of a liability — mirrors the entity's serialized fields (user excluded). */
public record LiabilityDTO(
        Long id, String name, Double amount, String type,
        Double emi, Double interestRate, Integer termMonths
) {

    public static LiabilityDTO from(Liability l) {
        return new LiabilityDTO(
                l.getId(), l.getName(), l.getAmount(), l.getType(),
                l.getEmi(), l.getInterestRate(), l.getTermMonths()
        );
    }
}
