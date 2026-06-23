package com.fintwin.security;

import com.nimbusds.jose.JWSObject;
import com.nimbusds.jose.JWSVerifier;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWK;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.util.Base64URL;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URL;
import java.time.Duration;
import java.time.Instant;

/**
 * Verifies Setu AA webhook signatures using their published JWKS.
 *
 * Setu signs each webhook with a detached JWS (RFC 7515 §7.2):
 *   x-jws-signature: <base64url(header)>..<base64url(signature)>
 *
 * The payload is detached (middle part is empty). We re-attach the raw
 * request body as the payload, then verify against Setu's public key.
 *
 * JWKS is fetched once and cached for 1 hour to avoid hammering Setu's
 * endpoint on every webhook. On cache miss or fetch failure the cache
 * is used (stale-on-error) so a transient Setu outage doesn't break us.
 */
@Component
public class SetuJwsVerifier {

    private static final Logger log = LoggerFactory.getLogger(SetuJwsVerifier.class);
    private static final Duration CACHE_TTL = Duration.ofHours(1);

    @Value("${setu.aa.base-url:https://fiu-uat.setu.co}")
    private String setuBaseUrl;

    private volatile JWKSet cachedJwks;
    private volatile Instant cacheExpiry = Instant.EPOCH;

    /**
     * @param rawBody   the raw webhook request body bytes
     * @param jwsHeader the value of the x-jws-signature request header
     * @return true if the signature is valid, false otherwise
     */
    public boolean verify(byte[] rawBody, String jwsHeader) {
        if (jwsHeader == null || jwsHeader.isBlank()) {
            log.warn("Setu webhook: missing x-jws-signature header");
            return false;
        }

        try {
            // Detached JWS format: headerB64..<empty>..signatureB64
            // Split on "." — middle part must be empty
            String[] parts = jwsHeader.split("\\.");
            if (parts.length != 3) {
                log.warn("Setu webhook: x-jws-signature is not a 3-part JWS compact serialization");
                return false;
            }
            if (!parts[1].isEmpty()) {
                log.warn("Setu webhook: payload part is non-empty — expected detached JWS");
                return false;
            }

            // Re-attach body as base64url-encoded payload
            String payloadB64 = Base64URL.encode(rawBody).toString();
            String fullJws = parts[0] + "." + payloadB64 + "." + parts[2];

            JWSObject jwsObject = JWSObject.parse(fullJws);
            String kid = jwsObject.getHeader().getKeyID();

            JWKSet jwks = getJwks();
            JWK jwk = (kid != null) ? jwks.getKeyByKeyId(kid) : null;
            if (jwk == null && !jwks.getKeys().isEmpty()) {
                // Fall back to first key if no kid match (Setu sandbox sometimes omits kid)
                jwk = jwks.getKeys().get(0);
            }
            if (jwk == null) {
                log.warn("Setu webhook: no usable JWK found in JWKS (kid={})", kid);
                return false;
            }

            JWSVerifier verifier = new RSASSAVerifier(jwk.toRSAKey());
            boolean valid = jwsObject.verify(verifier);
            if (!valid) {
                log.warn("Setu webhook: JWS signature verification failed");
            }
            return valid;

        } catch (Exception e) {
            log.error("Setu webhook: JWS verification threw an exception — {}", e.getMessage());
            return false;
        }
    }

    private synchronized JWKSet getJwks() {
        if (cachedJwks != null && Instant.now().isBefore(cacheExpiry)) {
            return cachedJwks;
        }
        String jwksUrl = setuBaseUrl + "/.well-known/jwks";
        try {
            log.info("Fetching Setu JWKS from {}", jwksUrl);
            JWKSet fresh = JWKSet.load(new URL(jwksUrl));
            cachedJwks = fresh;
            cacheExpiry = Instant.now().plus(CACHE_TTL);
            return fresh;
        } catch (Exception e) {
            log.error("Failed to fetch Setu JWKS from {} — {}", jwksUrl, e.getMessage());
            if (cachedJwks != null) {
                log.warn("Using stale JWKS cache (expired {}) due to fetch failure", cacheExpiry);
                return cachedJwks;
            }
            throw new IllegalStateException("Setu JWKS unavailable and no cache exists", e);
        }
    }
}
