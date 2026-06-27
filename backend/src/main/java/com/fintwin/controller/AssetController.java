package com.fintwin.controller;

import com.fintwin.dto.AssetDTO;
import com.fintwin.model.Asset;
import com.fintwin.service.AssetService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/assets")
public class AssetController {

    @Autowired
    private AssetService assetService;

    @PostMapping
    public AssetDTO createAsset(
            @RequestBody Asset asset
    ) {
        return AssetDTO.from(assetService.createAsset(asset));
    }

    @GetMapping
    public List<AssetDTO> getAssets() {
        return assetService.getAssets().stream()
                .map(AssetDTO::from)
                .toList();
    }

    @DeleteMapping("/{id}")
    public void deleteAsset(
            @PathVariable Long id
    ) {
        assetService.deleteAsset(id);
    }

    @PutMapping("/{id}")
    public AssetDTO updateAsset(

            @PathVariable Long id,

            @RequestBody Asset asset

    ) {

        return AssetDTO.from(assetService.updateAsset(id, asset));
    }
}