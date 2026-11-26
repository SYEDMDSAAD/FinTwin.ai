package com.fintwin.agent;

/**
 * Published by every import path (statement, CSV, SMS, email alert, bank
 * sync) once it has saved new transactions for a user. The agents run when
 * the import's transaction commits.
 */
public record TransactionsImported(Long userId, String source) {}
