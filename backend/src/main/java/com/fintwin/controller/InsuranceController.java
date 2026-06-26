package com.fintwin.controller;

import com.fintwin.dto.InsurancePolicyDTO;
import com.fintwin.service.InsurancePolicyService;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/insurance")
public class InsuranceController {

    @Autowired private InsurancePolicyService service;

    @GetMapping
    public List<InsurancePolicyDTO> getAll() {
        return service.getAll();
    }

    @PostMapping
    public InsurancePolicyDTO create(@RequestBody InsurancePolicyDTO dto) {
        return service.create(dto);
    }

    @PutMapping("/{id}")
    public InsurancePolicyDTO update(@PathVariable Long id, @RequestBody InsurancePolicyDTO dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
