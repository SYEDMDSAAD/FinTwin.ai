package com.fintwin.controller;

import com.fintwin.dto.LiabilityDTO;
import com.fintwin.model.Liability;
import com.fintwin.service.LiabilityService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/liabilities")
public class LiabilityController {

    @Autowired
    private LiabilityService liabilityService;

    @PostMapping
    public LiabilityDTO createLiability(
            @RequestBody Liability liability
    ) {
        return LiabilityDTO.from(liabilityService.createLiability(liability));
    }

    @GetMapping
    public List<LiabilityDTO> getLiabilities() {
        return liabilityService.getLiabilities().stream()
                .map(LiabilityDTO::from)
                .toList();
    }

    @DeleteMapping("/{id}")
    public void deleteLiability(
            @PathVariable Long id
    ) {
        liabilityService.deleteLiability(id);
    }

    @PutMapping("/{id}")
    public LiabilityDTO updateLiability(

            @PathVariable Long id,

            @RequestBody Liability liability

    ) {

        return LiabilityDTO.from(liabilityService.updateLiability(id, liability));
    }
}