package com.fintwin.util;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/** Same cases as ai-service/tests/test_redaction_and_scope.py: the two redactors must agree. */
class PiiRedactorTest {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "paid rahul.k@okaxis                                   | <UPI_ID>",
            "from 9876543210@ybl.                                  | <UPI_ID>",
            "mail me at someone@gmail.com                          | <EMAIL>",
            "call 9876543210                                       | <PHONE>",
            "call +91 98765 43210 now                              | <PHONE>",
            "card 4111 1111 1111 1111, thanks                      | <CARD_OR_ID>",
            "aadhaar 2345 6789 0123                                | <CARD_OR_ID>",
            "aadhaar 234567890123                                  | <AADHAAR>",
            "PAN ABCDE1234F                                        | <PAN>",
            "acct 123456789012345                                  | <NUMBER>",
            "password: hunter2                                     | password: <REDACTED>",
            "my otp is 482913                                      | otp is <REDACTED>",
            "Authorization: Bearer abcdefghijklmnop123             | Bearer <TOKEN>",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.abcdefghijk | <TOKEN>",
            "key AIzaSyA1234567890abcdefghijklmnopqrstuv           | <API_KEY>",
    })
    void identifiersAndSecretsAreMasked(String raw, String mask) {
        String out = PiiRedactor.redact(raw.strip());
        assertThat(out).contains(mask.strip());
        assertThat(out).doesNotContainPattern("\\d{6,}");
    }

    @ParameterizedTest
    @ValueSource(strings = {"₹1,23,456", "₹12,999", "120000", "₹4,50,00,000", "35.5%", "2026-11-20",
            "54000.75", "{\"amount\": 120000, \"amountFormatted\": \"₹1,20,000\"}", "Croma",
            "EMI of ₹18,000 for 36 months", "user #13 imported 42 rows"})
    void amountsDatesAndNamesAreLeftAlone(String text) {
        assertThat(PiiRedactor.redact(text)).isEqualTo(text);
    }

    @org.junit.jupiter.api.Test
    void nullAndEmptyPassThrough() {
        assertThat(PiiRedactor.redact(null)).isNull();
        assertThat(PiiRedactor.redact("")).isEmpty();
    }
}
