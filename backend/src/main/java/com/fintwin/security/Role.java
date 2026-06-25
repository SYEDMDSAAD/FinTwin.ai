package com.fintwin.security;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import java.util.Collection;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public enum Role {

    /**
     * Standard registered user.
     * All features are available here until a premium tier is introduced;
     * at that point move AI/bank/investment permissions to PREMIUM_USER only.
     */
    USER(EnumSet.of(
            Permission.READ_OWN_PROFILE,
            Permission.WRITE_OWN_PROFILE,
            Permission.DELETE_OWN_ACCOUNT,
            Permission.EXPORT_OWN_DATA,

            Permission.READ_OWN_TRANSACTIONS,
            Permission.WRITE_OWN_TRANSACTIONS,

            Permission.READ_OWN_BUDGETS,
            Permission.WRITE_OWN_BUDGETS,

            Permission.READ_OWN_GOALS,
            Permission.WRITE_OWN_GOALS,

            Permission.READ_OWN_NET_WORTH,
            Permission.WRITE_OWN_ASSETS,
            Permission.WRITE_OWN_LIABILITIES,

            Permission.READ_OWN_INVESTMENTS,
            Permission.WRITE_OWN_INVESTMENTS,

            Permission.READ_OWN_INSURANCE,
            Permission.WRITE_OWN_INSURANCE,

            Permission.USE_AI_BASIC,
            Permission.USE_AI_COPILOT,
            Permission.USE_AI_FORECAST,
            Permission.USE_AI_REPORT,
            Permission.USE_AI_SPENDING_COACH,

            Permission.CONNECT_BANK_ACCOUNT,
            Permission.READ_OWN_BANK_CONNECTIONS,
            Permission.DISCONNECT_BANK_ACCOUNT
    )),

    /**
     * Paid subscriber — reserved for when premium tier is launched.
     * Currently inherits USER permissions; at launch, strip AI/bank/investment
     * from USER and keep them only here.
     */
    PREMIUM_USER(combine(USER, EnumSet.noneOf(Permission.class))),

    /**
     * Internal support agent — read-only access to any user's data.
     * Does NOT inherit USER permissions (different trust domain).
     */
    SUPPORT_AGENT(EnumSet.of(
            Permission.READ_ANY_USER_PROFILE,
            Permission.READ_ANY_USER_TRANSACTIONS,
            Permission.FLAG_SUSPICIOUS_ACTIVITY
    )),

    /**
     * Compliance role — everything SUPPORT_AGENT has plus audit and freeze.
     */
    COMPLIANCE_OFFICER(combine(SUPPORT_AGENT, EnumSet.of(
            Permission.READ_AUDIT_LOGS,
            Permission.READ_ALL_USERS,
            Permission.FREEZE_ANY_ACCOUNT,
            Permission.READ_AGGREGATE_ANALYTICS,
            Permission.EXPORT_ANONYMIZED_DATA
    ))),

    /**
     * Risk analyst — analytics and audit access, no PII.
     */
    RISK_ANALYST(EnumSet.of(
            Permission.READ_AGGREGATE_ANALYTICS,
            Permission.EXPORT_ANONYMIZED_DATA,
            Permission.READ_AUDIT_LOGS
    )),

    /**
     * Platform administrator.
     */
    ADMIN(combine(COMPLIANCE_OFFICER, EnumSet.of(
            Permission.WRITE_ANY_USER_PROFILE,
            Permission.DELETE_ANY_USER,
            Permission.EXPORT_ALL_DATA,
            Permission.MANAGE_ROLES,
            Permission.MANAGE_SYSTEM_CONFIG
    ))),

    /**
     * Super-admin — all permissions.
     */
    SUPER_ADMIN(EnumSet.allOf(Permission.class));

    // ─────────────────────────────────────────────────────────────────

    private final Set<Permission> permissions;

    Role(Set<Permission> permissions) {
        this.permissions = Collections.unmodifiableSet(permissions);
    }

    public Set<Permission> getPermissions() {
        return permissions;
    }

    public boolean hasPermission(Permission permission) {
        return permissions.contains(permission);
    }

    /**
     * Returns both the role authority ("ROLE_USER") and every individual
     * permission so @PreAuthorize("hasAuthority('READ_OWN_TRANSACTIONS')") works.
     */
    public Collection<GrantedAuthority> getAuthorities() {
        List<GrantedAuthority> authorities = permissions.stream()
                .map(p -> (GrantedAuthority) new SimpleGrantedAuthority(p.name()))
                .collect(Collectors.toList());
        authorities.add(new SimpleGrantedAuthority("ROLE_" + this.name()));
        return Collections.unmodifiableList(authorities);
    }

    /**
     * Merges base role's permissions with the supplied extras.
     * Called only from enum constant initializers where earlier constants are already set.
     */
    private static Set<Permission> combine(Role base, Set<Permission> extras) {
        Set<Permission> merged = EnumSet.copyOf(base.permissions);
        merged.addAll(extras);
        return merged;
    }

    public static Role fromString(String value) {
        if (value == null || value.isBlank()) return USER;
        try {
            return Role.valueOf(value.toUpperCase());
        } catch (IllegalArgumentException e) {
            return USER;
        }
    }
}
