package com.fintwin.security;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

class AiToolTokenTest {

    private static final Instant NOW = Instant.parse("2026-09-26T10:00:00Z");
    private final AiToolToken tokens = new AiToolToken("secret-a", Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void aFreshTokenAllowsOnlyItsOwnUser() {
        String t = tokens.mint(8L);
        assertThat(tokens.allows(t, 8L)).isTrue();
        assertThat(tokens.allows(t, 9L)).isFalse();
    }

    @Test
    void itExpires() {
        String t = tokens.mint(8L);
        AiToolToken later = new AiToolToken("secret-a",
                Clock.fixed(NOW.plusSeconds(AiToolToken.TTL_SECONDS + 1), ZoneOffset.UTC));
        assertThat(later.allows(t, 8L)).isFalse();
    }

    @Test
    void editingTheUserOrExpiryBreaksTheSignature() {
        String[] p = tokens.mint(8L).split("\\.");
        assertThat(tokens.allows("9." + p[1] + "." + p[2], 9L)).isFalse();
        assertThat(tokens.allows(p[0] + "." + (Long.parseLong(p[1]) + 3600) + "." + p[2], 8L)).isFalse();
    }

    @Test
    void aTokenFromAnotherSecretIsRejected() {
        AiToolToken other = new AiToolToken("secret-b", Clock.fixed(NOW, ZoneOffset.UTC));
        assertThat(tokens.allows(other.mint(8L), 8L)).isFalse();
    }

    @Test
    void garbageIsRejected() {
        assertThat(tokens.allows(null, 8L)).isFalse();
        assertThat(tokens.allows("", 8L)).isFalse();
        assertThat(tokens.allows("8.abc.def", 8L)).isFalse();
        assertThat(tokens.allows("a.b.c.d", 8L)).isFalse();
    }
}
