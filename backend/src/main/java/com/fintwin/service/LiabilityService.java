package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.Liability;
import com.fintwin.model.User;
import com.fintwin.repository.LiabilityRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class LiabilityService {

    @Autowired private LiabilityRepository liabilityRepository;
    @Autowired private UserRepository userRepository;

    @PreAuthorize("hasAuthority('WRITE_OWN_LIABILITIES')")
    @Audited(action = "WRITE", resource = "liabilities", description = "Liability created")
    public Liability createLiability(Liability liability) {

        // Prevent mass-assignment: a client-supplied id would turn save() into a
        // merge and could overwrite another user's row. Always create a fresh row.
        liability.setId(null);

        validate(liability);

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        liability.setUser(user);

        return liabilityRepository.save(liability);
    }

    @PreAuthorize("hasAuthority('READ_OWN_NET_WORTH')")
    @Audited(action = "READ", resource = "liabilities", description = "Liabilities retrieved")
    public List<Liability> getLiabilities() {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        return liabilityRepository.findByUser(user);
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_LIABILITIES')")
    @Audited(action = "DELETE", resource = "liabilities", description = "Liability deleted")
    public void deleteLiability(Long id) {
        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        Liability liability = liabilityRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Liability not found"));

        if (liability.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new AccessDeniedException("Access denied");
        }
        liabilityRepository.deleteById(id);
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_LIABILITIES')")
    @Audited(action = "WRITE", resource = "liabilities", description = "Liability updated")
    public Liability updateLiability(Long id, Liability updated) {

        validate(updated);

        String email = SecurityUtils.getCurrentUserEmail();
        User user = userRepository.findByEmail(email).orElseThrow();
        Liability liability = liabilityRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Liability not found"));

        if (liability.getUser().getId().longValue()
        != user.getId().longValue()) {
            throw new AccessDeniedException("Access denied");
        }

        liability.setName(updated.getName().trim());
        liability.setAmount(updated.getAmount());
        liability.setType(updated.getType());
        liability.setInterestRate(updated.getInterestRate());
        liability.setEmi(updated.getEmi());
        liability.setTermMonths(updated.getTermMonths());

        return liabilityRepository.save(liability);
    }

    // The optional loan fields feed the DTI and credit-score math — a negative
    // EMI or rate stored here would silently skew scores with no trace back.
    private void validate(Liability l) {
        if (l.getName() == null || l.getName().isBlank()) {
            throw new IllegalArgumentException("Liability name required");
        }
        if (l.getAmount() == null || l.getAmount() < 0) {
            throw new IllegalArgumentException("Liability amount must be >= 0");
        }
        if (l.getEmi() != null && l.getEmi() <= 0) {
            throw new IllegalArgumentException("EMI must be greater than 0 when provided");
        }
        if (l.getInterestRate() != null && l.getInterestRate() < 0) {
            throw new IllegalArgumentException("Interest rate cannot be negative");
        }
        if (l.getTermMonths() != null && l.getTermMonths() <= 0) {
            throw new IllegalArgumentException("Repayment term must be at least 1 month when provided");
        }
    }
}
