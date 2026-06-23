package com.fintwin.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * PCI-DSS Requirement 10.7 — Audit log retention.
 *
 * Runs nightly and hard-deletes audit records that have exceeded the
 * configured retention window (default 7 years for fintech/GLBA).
 *
 * Configure via application.properties:
 *   audit.retention.years=7          # how long to keep records
 *   audit.retention.dry-run=true     # log what would be deleted without deleting
 *
 * The DB user needs DELETE permission on audit_log only for this job.
 * If the permission is not granted, the job logs a warning and skips.
 */
@Service
public class AuditRetentionService {

    private static final Logger log = LoggerFactory.getLogger(AuditRetentionService.class);

    private final AuditLogRepository repository;

    @Value("${audit.retention.years:7}")
    private int retentionYears;

    @Value("${audit.retention.dry-run:false}")
    private boolean dryRun;

    public AuditRetentionService(AuditLogRepository repository) {
        this.repository = repository;
    }

    // Runs every night at 02:00 server time
    @Scheduled(cron = "0 0 2 * * *")
    public void purgeExpiredLogs() {
        LocalDateTime cutoff = LocalDateTime.now().minusYears(retentionYears);
        long eligible = repository.countByTimestampBefore(cutoff);

        if (eligible == 0) {
            log.info("Audit retention: no records older than {} years — nothing to purge.", retentionYears);
            return;
        }

        if (dryRun) {
            log.warn("Audit retention (DRY RUN): {} records older than {} years would be purged (cutoff={}).",
                    eligible, retentionYears, cutoff);
            return;
        }

        try {
            int deleted = repository.deleteOlderThan(cutoff);
            log.info("Audit retention: purged {} records older than {} years (cutoff={}).",
                    deleted, retentionYears, cutoff);
        } catch (Exception e) {
            log.error("Audit retention failed — check that the DB user has DELETE on audit_log: {}", e.getMessage());
        }
    }
}
