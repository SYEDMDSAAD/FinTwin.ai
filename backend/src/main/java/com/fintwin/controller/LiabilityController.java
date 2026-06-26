package com.fintwin.controller;

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
    public Liability createLiability(
            @RequestBody Liability liability
    ) {
        return liabilityService.createLiability(liability);
    }

    @GetMapping
    public List<Liability> getLiabilities() {
        return liabilityService.getLiabilities();
    }

    @DeleteMapping("/{id}")
    public void deleteLiability(
            @PathVariable Long id
    ) {
        liabilityService.deleteLiability(id);
    }

    @PutMapping("/{id}")
    public Liability updateLiability(

            @PathVariable Long id,

            @RequestBody Liability liability

    ) {

        return liabilityService.updateLiability(
                id,
                liability
        );
    }
}