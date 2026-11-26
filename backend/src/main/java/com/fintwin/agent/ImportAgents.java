package com.fintwin.agent;

import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.service.AlertImporter;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Runs the sorting agent, then the watch agent (categories feed its checks),
 * once an import's new transactions are committed.
 *
 * Synchronous on purpose: Cloud Run only gives an instance CPU while a request
 * is open, so work left running after the response may never finish. The
 * import's response waits for the agents instead; each is time-boxed and
 * swallows its own failures, so an agent can never fail an import.
 */
@Component
public class ImportAgents {

    private final UserRepository users;
    private final SortingAgent sorting;
    private final WatchAgent watch;
    private final AlertImporter caches;
    private final TransactionTemplate reads;

    public ImportAgents(UserRepository users, SortingAgent sorting, WatchAgent watch, AlertImporter caches,
                        PlatformTransactionManager txManager) {
        this.users = users;
        this.sorting = sorting;
        this.watch = watch;
        this.caches = caches;
        this.reads = new TransactionTemplate(txManager);
        this.reads.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.reads.setReadOnly(true);
    }

    @TransactionalEventListener(fallbackExecution = true)
    public void afterImport(TransactionsImported event) {
        User user = reads.execute(s -> users.findById(event.userId()).orElse(null));
        if (user == null) return;
        SortingAgent.Result sorted = sorting.run(user);
        if (sorted.payments() > 0) caches.evictUserCaches(user);
        watch.run(user);
    }
}
