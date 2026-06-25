package com.fintwin.security;

import com.fintwin.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.PermissionEvaluator;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.io.Serializable;

/**
 * Enables resource-level ownership checks via Spring Security expressions such as:
 *   @PreAuthorize("hasPermission(#id, 'Transaction', 'READ')")
 *
 * The check verifies that the authenticated user is the owner of the named resource.
 * Returns false (not 403) when the resource doesn't exist — callers should throw
 * their own EntityNotFoundException so they control the error message.
 */
@Component
public class FinTwinPermissionEvaluator implements PermissionEvaluator {

    @Autowired private TransactionRepository transactionRepository;
    @Autowired private BudgetRepository budgetRepository;
    @Autowired private FinancialGoalRepository goalRepository;
    @Autowired private AssetRepository assetRepository;
    @Autowired private LiabilityRepository liabilityRepository;
    @Autowired private UserRepository userRepository;

    @Override
    public boolean hasPermission(Authentication auth, Object targetDomainObject, Object permission) {
        return false; // object-instance form not used
    }

    @Override
    public boolean hasPermission(Authentication auth, Serializable targetId, String targetType, Object permission) {
        if (auth == null || targetId == null || targetType == null) return false;

        String email = auth.getName();
        Long id;
        try {
            id = Long.parseLong(targetId.toString());
        } catch (NumberFormatException e) {
            return false;
        }

        return switch (targetType) {
            case "Transaction" -> transactionRepository.findById(id)
                    .map(t -> t.getUser() != null && email.equals(t.getUser().getEmail()))
                    .orElse(false);
            case "Budget"      -> budgetRepository.findById(id)
                    .map(b -> b.getUser() != null && email.equals(b.getUser().getEmail()))
                    .orElse(false);
            case "Goal"        -> goalRepository.findById(id)
                    .map(g -> g.getUser() != null && email.equals(g.getUser().getEmail()))
                    .orElse(false);
            case "Asset"       -> assetRepository.findById(id)
                    .map(a -> a.getUser() != null && email.equals(a.getUser().getEmail()))
                    .orElse(false);
            case "Liability"   -> liabilityRepository.findById(id)
                    .map(l -> l.getUser() != null && email.equals(l.getUser().getEmail()))
                    .orElse(false);
            default -> false;
        };
    }
}
