// ─── AuditAsyncConfig.java ────────────────────────────────────────────────────
// This file must be created alongside the audit package.
// It configures the dedicated thread pool for async audit writes
// so they never compete with the main request thread pool.
package com.fintwin.audit;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * Dedicated async executor for audit log writes.
 *
 * Why a separate executor:
 * - Audit writes must never block or slow down the main request.
 * - If the audit DB is slow, main requests keep responding normally.
 * - The queue absorbs bursts; the caller is never waiting.
 *
 * Why RejectedExecutionHandler = CallerRunsPolicy:
 * - If the queue is full (very high load), the audit write falls
 *   back to running on the calling thread rather than being dropped.
 * - This is preferable to losing audit records during traffic spikes.
 */
@Configuration
@EnableAsync
public class AuditAsyncConfig {

    @Bean(name = "auditTaskExecutor")
    public Executor auditTaskExecutor() {

        ThreadPoolTaskExecutor executor =
                new ThreadPoolTaskExecutor();

        // Core threads always alive — handles normal audit load
        executor.setCorePoolSize(2);

        // Max threads during bursts
        executor.setMaxPoolSize(5);

        // Queue of pending audit writes before spinning up more threads
        executor.setQueueCapacity(500);

        // Thread name prefix — makes audit threads identifiable in logs/APM
        executor.setThreadNamePrefix("audit-");

        // IMPORTANT: CallerRunsPolicy — if queue is full, write on
        // the calling thread rather than dropping the audit event.
        // This is the correct trade-off for PCI-DSS compliance:
        // slightly slower response is better than missing an audit log.
        executor.setRejectedExecutionHandler(
                new ThreadPoolExecutor.CallerRunsPolicy()
        );

        // Wait for pending audit writes to complete before shutdown
        executor.setWaitForTasksToCompleteOnShutdown(true);

        // Max wait time on shutdown (covers slow DB writes)
        executor.setAwaitTerminationSeconds(30);

        executor.initialize();
        return executor;
    }
}