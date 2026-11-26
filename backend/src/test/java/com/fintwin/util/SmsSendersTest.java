package com.fintwin.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class SmsSendersTest {

    @Test
    void readsTheBankFromEveryHeaderForm() {
        assertThat(SmsSenders.bankFor("VM-HDFCBK")).contains("HDFC");
        assertThat(SmsSenders.bankFor("AD-ICICIT-S")).contains("ICICI");
        assertThat(SmsSenders.bankFor("JD-SBIINB-T")).contains("SBI");
        assertThat(SmsSenders.bankFor("hdfcbk")).contains("HDFC");
    }

    @Test
    void phoneNumbersAndOtherSendersAreNotBanks() {
        assertThat(SmsSenders.bankFor("+919876543210")).isEmpty();
        assertThat(SmsSenders.bankFor("VM-123456")).isEmpty();
        assertThat(SmsSenders.bankFor("VM-SWIGGY")).isEmpty();
        assertThat(SmsSenders.bankFor("")).isEmpty();
        assertThat(SmsSenders.bankFor(null)).isEmpty();
        assertThat(SmsSenders.code("VM-SWIGGY-P")).isEqualTo("SWIGGY");
        assertThat(SmsSenders.code("57575")).isNull();
    }
}
