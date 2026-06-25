package com.fintwin.service;

import com.fintwin.dto.InsurancePolicyDTO;
import com.fintwin.model.InsurancePolicy;
import com.fintwin.model.User;
import com.fintwin.repository.InsurancePolicyRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class InsurancePolicyService {

    @Autowired private InsurancePolicyRepository repository;
    @Autowired private UserRepository userRepository;

    private User currentUser() {
        return userRepository.findByEmail(SecurityUtils.getCurrentUserEmail()).orElseThrow();
    }

    @PreAuthorize("hasAuthority('READ_OWN_INSURANCE')")
    public List<InsurancePolicyDTO> getAll() {
        return repository.findByUserOrderByCreatedAtDesc(currentUser())
                .stream().map(InsurancePolicyDTO::from).collect(Collectors.toList());
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INSURANCE')")
    public InsurancePolicyDTO create(InsurancePolicyDTO dto) {
        InsurancePolicy policy = new InsurancePolicy();
        policy.setUser(currentUser());
        applyFields(policy, dto);
        return InsurancePolicyDTO.from(repository.save(policy));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INSURANCE')")
    public InsurancePolicyDTO update(Long id, InsurancePolicyDTO dto) {
        User user = currentUser();
        InsurancePolicy policy = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Policy not found"));
        if (!policy.getUser().getId().equals(user.getId()))
            throw new AccessDeniedException("Access denied");
        applyFields(policy, dto);
        return InsurancePolicyDTO.from(repository.save(policy));
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INSURANCE')")
    public void delete(Long id) {
        User user = currentUser();
        InsurancePolicy policy = repository.findById(id)
                .orElseThrow(() -> new RuntimeException("Policy not found"));
        if (!policy.getUser().getId().equals(user.getId()))
            throw new AccessDeniedException("Access denied");
        repository.delete(policy);
    }

    private void applyFields(InsurancePolicy policy, InsurancePolicyDTO dto) {
        policy.setType(dto.getType());
        policy.setProvider(dto.getProvider());
        policy.setPremium(dto.getPremium());
        policy.setFrequency(dto.getFrequency());
        policy.setSumAssured(dto.getSumAssured());
        policy.setRenewalDate(dto.getRenewalDate());
        policy.setNotes(dto.getNotes());
    }
}
