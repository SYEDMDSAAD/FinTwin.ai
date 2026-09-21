package com.fintwin.service;

import org.apache.james.jdkim.DKIMVerifier;
import org.apache.james.jdkim.api.SignatureRecord;
import org.apache.james.jdkim.exceptions.CompositeFailException;
import org.apache.james.jdkim.exceptions.FailException;
import org.apache.james.jdkim.exceptions.TempFailException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * Which domains validly DKIM-signed a raw email.
 *
 * A temporary failure (the signer's DNS key could not be fetched) is reported
 * separately from "not signed", so the caller can ask for the email to be
 * redelivered instead of dropping a real transaction.
 */
@Component
public class DkimCheck {

    private static final Logger log = LoggerFactory.getLogger(DkimCheck.class);

    public record Result(Set<String> domains, boolean temporaryFailure) {
        static Result none() { return new Result(Set.of(), false); }
    }

    // DKIMVerifier keeps per-message state, so every check gets a fresh one
    private final Supplier<DKIMVerifier> verifiers;

    public DkimCheck() {
        this(DKIMVerifier::new);
    }

    DkimCheck(Supplier<DKIMVerifier> verifiers) {
        this.verifiers = verifiers;
    }

    public Result check(byte[] rawEmail) {
        try {
            List<SignatureRecord> valid = verifiers.get().verify(new ByteArrayInputStream(rawEmail));
            if (valid == null) return Result.none();       // no DKIM-Signature at all
            return new Result(valid.stream()
                    .map(r -> r.getDToken().toString().toLowerCase(Locale.ROOT))
                    .collect(Collectors.toSet()), false);
        } catch (FailException e) {
            // With several signatures every failure comes wrapped together; one
            // that failed only for want of a DNS answer may yet verify on retry
            boolean temporary = e instanceof TempFailException
                    || (e instanceof CompositeFailException c
                        && c.getExceptions().stream().anyMatch(x -> x instanceof TempFailException));
            if (temporary) log.warn("DKIM key lookup failed temporarily: {}", e.getMessage());
            return new Result(Set.of(), temporary);
        } catch (Exception e) {
            log.debug("DKIM check could not parse the message: {}", e.getMessage());
            return Result.none();
        }
    }
}
