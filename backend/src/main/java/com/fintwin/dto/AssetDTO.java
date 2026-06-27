package com.fintwin.dto;

import com.fintwin.model.Asset;

/** API representation of an asset — mirrors the entity's serialized fields (user excluded). */
public record AssetDTO(Long id, String name, Double amount, String type) {

    public static AssetDTO from(Asset a) {
        return new AssetDTO(a.getId(), a.getName(), a.getAmount(), a.getType());
    }
}
