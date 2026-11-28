package com.fintwin.filter;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MdcLoggingFilterTest {

    @Test
    void logsNameAUserByAStableHashNeverTheirEmail() {
        String ref = MdcLoggingFilter.userRef("Someone@Gmail.com");
        assertThat(ref).hasSize(12).doesNotContain("@").doesNotContain("someone");
        assertThat(MdcLoggingFilter.userRef("someone@gmail.com ")).isEqualTo(ref);   // same person, same ref
        assertThat(MdcLoggingFilter.userRef("other@gmail.com")).isNotEqualTo(ref);
        assertThat(ref).matches("[A-Za-z0-9_-]{12}");
    }
}
