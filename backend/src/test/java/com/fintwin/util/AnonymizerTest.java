package com.fintwin.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AnonymizerTest {

    private final Anonymizer a = Anonymizer.withNames(List.of("Syed Mohammad Saad", "Priya Nair"));

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "mail me at syed.saad@gmail.com please          | mail me at <EMAIL> please",
            "paid rahul.k@okaxis for dinner                 | paid <UPI_ID> for dinner",
            "UPI to 9876543210@ybl                          | UPI to <UPI_ID>",
            "You sent it via 9876543210@ybl.                | You sent it via <UPI_ID>.",
            "call +91 9876543210 or 9123456780              | call <PHONE> or <PHONE>",
            "Received from ******1317                       | Received from <MASKED>",
            "NEFT to A/c 50100123456789 ref 412345678       | NEFT to A/c <NUM> ref <NUM>",
            "what did I send Priya last month?              | what did I send <PERSON> last month?",
            "is SAAD's rent too high                        | is <PERSON>'s rent too high",
    })
    void scrubsIdentifyingText(String in, String out) {
        assertThat(a.text(in)).isEqualTo(out);
    }

    @Test
    void keepsWhatCategorisationLearnsFrom() {
        assertThat(a.text("Swiggy order ₹450 on 12 Sep")).isEqualTo("Swiggy order ₹450 on 12 Sep");
        assertThat(a.merchant("Paid to Noor bakery show room")).isEqualTo("Paid to Noor bakery show room");
        assertThat(a.merchant("UPI/DR/412/SWIGGY/swiggy@icici")).isEqualTo("UPI/DR/412/SWIGGY/<UPI_ID>");
    }

    @Test
    void aPaymentToAPersonLosesTheName() {
        assertThat(a.merchant("Paid to RAHUL KUMAR SHARMA")).isEqualTo("Paid to <PERSON>");
        assertThat(a.merchant("Paid to 9812345678@ybl")).isEqualTo("Paid to <PERSON>");
    }

    @Test
    void shortNamePartsAreNotScrubbedEverywhere() {
        Anonymizer b = Anonymizer.withNames(List.of("Al Khan"));
        assertThat(b.text("Total of all Khan payments")).isEqualTo("Total of all <PERSON> payments");
    }

    @Test
    void aUpiIdGivenAsANameIsNotSplitIntoWords() {
        Anonymizer b = Anonymizer.withNames(List.of("9876543210@ybl", "RAHUL KUMAR"));
        assertThat(b.text("paid via ybl app to Rahul")).isEqualTo("paid via ybl app to <PERSON>");
    }

    @Test
    void nullStaysNull() {
        assertThat(a.text(null)).isNull();
        assertThat(a.merchant(null)).isNull();
    }
}
