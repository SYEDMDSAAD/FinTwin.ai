package com.fintwin.security;

public enum Permission {

    // ── Profile ──────────────────────────────────────────────────────
    READ_OWN_PROFILE,
    WRITE_OWN_PROFILE,
    DELETE_OWN_ACCOUNT,
    EXPORT_OWN_DATA,

    // ── Transactions ─────────────────────────────────────────────────
    READ_OWN_TRANSACTIONS,
    WRITE_OWN_TRANSACTIONS,

    // ── Budgets ──────────────────────────────────────────────────────
    READ_OWN_BUDGETS,
    WRITE_OWN_BUDGETS,

    // ── Goals ────────────────────────────────────────────────────────
    READ_OWN_GOALS,
    WRITE_OWN_GOALS,

    // ── Net Worth ────────────────────────────────────────────────────
    READ_OWN_NET_WORTH,
    WRITE_OWN_ASSETS,
    WRITE_OWN_LIABILITIES,

    // ── Investments ──────────────────────────────────────────────────
    READ_OWN_INVESTMENTS,
    WRITE_OWN_INVESTMENTS,

    // ── Insurance ────────────────────────────────────────────────────
    READ_OWN_INSURANCE,
    WRITE_OWN_INSURANCE,

    // ── AI — Basic (all users) ───────────────────────────────────────
    USE_AI_BASIC,

    // ── AI — Premium ─────────────────────────────────────────────────
    USE_AI_COPILOT,
    USE_AI_FORECAST,
    USE_AI_REPORT,
    USE_AI_SPENDING_COACH,

    // ── Bank Connections (Setu AA) ───────────────────────────────────
    CONNECT_BANK_ACCOUNT,
    READ_OWN_BANK_CONNECTIONS,
    DISCONNECT_BANK_ACCOUNT,

    // ── Admin: User Management ───────────────────────────────────────
    READ_ANY_USER_PROFILE,
    WRITE_ANY_USER_PROFILE,
    DELETE_ANY_USER,
    READ_ANY_USER_TRANSACTIONS,
    EXPORT_ALL_DATA,

    // ── Admin: Compliance & Risk ─────────────────────────────────────
    READ_AUDIT_LOGS,
    READ_ALL_USERS,
    FREEZE_ANY_ACCOUNT,
    FLAG_SUSPICIOUS_ACTIVITY,
    READ_AGGREGATE_ANALYTICS,
    EXPORT_ANONYMIZED_DATA,

    // ── System ───────────────────────────────────────────────────────
    MANAGE_ROLES,
    MANAGE_SYSTEM_CONFIG
}
