package com.fintwin.controller;

import com.fintwin.model.Asset;
import com.fintwin.service.AssetService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/assets")
public class AssetController {

    @Autowired
    private AssetService assetService;

    @PostMapping
    public Asset createAsset(
            @RequestBody Asset asset
    ) {
        return assetService.createAsset(asset);
    }

    @GetMapping
    public List<Asset> getAssets() {
        return assetService.getAssets();
    }

    @DeleteMapping("/{id}")
    public void deleteAsset(
            @PathVariable Long id
    ) {
        assetService.deleteAsset(id);
    }

    @PutMapping("/{id}")
    public Asset updateAsset(

            @PathVariable Long id,

            @RequestBody Asset asset

    ) {

        return assetService.updateAsset(
                id,
                asset
        );
    }
}