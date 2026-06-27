package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Asset;
import com.fintwin.model.User;
import com.fintwin.repository.AssetRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class AssetService {

    @Autowired private AssetRepository assetRepository;
    @Autowired private UserRepository userRepository;

    @PreAuthorize("hasAuthority('WRITE_OWN_ASSETS')")
    @Audited(action = "WRITE", resource = "assets", description = "Asset created")
    public Asset createAsset(Asset asset) {

        if (asset.getName() == null || asset.getName().isBlank()) {
            throw new IllegalArgumentException("Asset name required");
        }
        if (asset.getAmount() == null || asset.getAmount() < 0) {
            throw new IllegalArgumentException("Asset amount must be >= 0");
        }

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        asset.setUser(user);

        return assetRepository.save(asset);
    }

    @PreAuthorize("hasAuthority('READ_OWN_NET_WORTH')")
    @Audited(action = "READ", resource = "assets", description = "Assets retrieved")
    public List<Asset> getAssets() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        return assetRepository.findByUser(user);
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_ASSETS')")
    @Audited(action = "DELETE", resource = "assets", description = "Asset deleted")
    public void deleteAsset(Long id) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Asset not found"));

        // FIXED: Long.equals boxing bug
        if (asset.getUser().getId().longValue()
                != user.getId().longValue()) {
            throw new org.springframework.security.access.AccessDeniedException("Access denied");
        }
        assetRepository.deleteById(id);
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_ASSETS')")
    @Audited(action = "WRITE", resource = "assets", description = "Asset updated")
    public Asset updateAsset(Long id, Asset updatedAsset) {

        if (updatedAsset.getName() == null || updatedAsset.getName().isBlank()) {
            throw new IllegalArgumentException("Asset name required");
        }
        if (updatedAsset.getAmount() == null || updatedAsset.getAmount() < 0) {
            throw new IllegalArgumentException("Asset amount must be >= 0");
        }

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        Asset asset = assetRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Asset not found"));

        if (asset.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new org.springframework.security.access.AccessDeniedException("Access denied");
        }

        asset.setName(updatedAsset.getName().trim());
        asset.setAmount(updatedAsset.getAmount());
        asset.setType(updatedAsset.getType());

        return assetRepository.save(asset);
    }
}
