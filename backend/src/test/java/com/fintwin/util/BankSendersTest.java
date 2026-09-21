package com.fintwin.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class BankSendersTest {

    @Test
    void recognisesLegacyBankDomainsAndTheirSubdomains() {
        assertThat(BankSenders.bankFor("hdfcbank.net")).contains("HDFC");
        assertThat(BankSenders.bankFor("alerts.hdfcbank.net")).contains("HDFC");
        assertThat(BankSenders.bankFor("alerts.sbi.co.in")).contains("SBI");
        assertThat(BankSenders.bankFor("ICICIBANK.COM")).contains("ICICI");
    }

    @Test
    void anyDomainUnderBankInIsABank() {
        // .bank.in is reserved by RBI for regulated banks
        assertThat(BankSenders.bankFor("alerts.hdfc.bank.in")).contains("HDFC");
        assertThat(BankSenders.bankFor("sbi.bank.in")).contains("SBI");
        assertThat(BankSenders.bankFor("mail.somecoop.bank.in")).contains("Somecoop");
    }

    @Test
    void lookalikesAreNotBanks() {
        assertThat(BankSenders.bankFor("hdfcbank.net.evil.com")).isEmpty();
        assertThat(BankSenders.bankFor("hdfcbank-alerts.com")).isEmpty();
        assertThat(BankSenders.bankFor("bank.in")).isEmpty();
        assertThat(BankSenders.bankFor("gmail.com")).isEmpty();
        assertThat(BankSenders.bankFor(null)).isEmpty();
    }

    @Test
    void orgDomainKeepsTheRegistrablePart() {
        assertThat(BankSenders.orgDomain("alerts.hdfcbank.net")).isEqualTo("hdfcbank.net");
        assertThat(BankSenders.orgDomain("alerts.sbi.co.in")).isEqualTo("sbi.co.in");
        assertThat(BankSenders.orgDomain("x.y.hdfc.bank.in")).isEqualTo("hdfc.bank.in");
    }

    @Test
    void alignmentNeedsTheSameOrganisation() {
        assertThat(BankSenders.aligned("hdfcbank.net", "alerts.hdfcbank.net")).isTrue();
        // Gmail's own forwarding signature says nothing about who wrote the alert
        assertThat(BankSenders.aligned("gmail.com", "alerts.hdfcbank.net")).isFalse();
        assertThat(BankSenders.aligned("sbi.co.in", "hdfc.co.in")).isFalse();
    }

    @Test
    void domainOfAnAddress() {
        assertThat(BankSenders.domainOf("HDFC Bank <Alerts@HDFCBank.net>")).isEqualTo("hdfcbank.net");
        assertThat(BankSenders.domainOf("nobody")).isNull();
    }
}
