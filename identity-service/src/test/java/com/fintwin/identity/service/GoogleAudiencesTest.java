package com.fintwin.identity.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GoogleAudiencesTest {

    @Test
    void webOnlyUntilAnIosClientIsSet() {
        assertThat(AuthService.googleAudiences("web.apps", "")).containsExactly("web.apps");
        assertThat(AuthService.googleAudiences("web.apps", null)).containsExactly("web.apps");
    }

    @Test
    void bothWhenTheIosClientIsSet() {
        assertThat(AuthService.googleAudiences("web.apps", " ios.apps ")).containsExactly("web.apps", "ios.apps");
    }
}
