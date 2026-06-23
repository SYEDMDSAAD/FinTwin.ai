// ─── Audited.java ─────────────────────────────────────────────────────────────
package com.fintwin.audit;

import java.lang.annotation.*;

/**
 * Marks a service method for automatic PCI-DSS audit logging.
 *
 * Usage:
 *   @Audited(action = "READ", resource = "transactions")
 *   public List<Transaction> getAllTransactions() { ... }
 *
 *   @Audited(
 *       action = "DELETE",
 *       resource = "budgets",
 *       description = "User deleted a budget category"
 *   )
 *   public void deleteBudget(Long id) { ... }
 *
 * Actions to use (keep consistent across the codebase):
 *   READ    — any data retrieval
 *   WRITE   — create or update
 *   DELETE  — deletion
 *   LOGIN   — authentication event
 *   LOGOUT  — session termination
 *   EXPORT  — data export (PDF, CSV)
 *   UPLOAD  — file upload (OCR, CSV import)
 *
 * FIXES from original:
 * 1. Added @Documented so the annotation appears in Javadoc.
 * 2. Added @Inherited so subclass overrides also carry the annotation.
 * 3. Added description() field for custom human-readable context.
 *    Defaults to empty string so existing usages don't break.
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented   // ADDED: shows in Javadoc
@Inherited    // ADDED: carried by subclass overrides
public @interface Audited {

    /**
     * The type of action being performed.
     * Use one of: READ, WRITE, DELETE, LOGIN, LOGOUT, EXPORT, UPLOAD
     */
    String action();

    /**
     * The resource being acted upon.
     * e.g. "transactions", "budgets", "profile", "goals", "auth"
     */
    String resource();

    /**
     * Optional human-readable description for audit log context.
     * If left empty, AuditAspect auto-generates one from the
     * method signature.
     */
    String description() default "";
}


