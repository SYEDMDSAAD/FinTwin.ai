package com.fintwin.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Payee names in the shapes Indian statements and UPI apps print them.
 * Invented for the test; the patterns come from a real PhonePe statement,
 * where these rules took "Other" from 96.6% of spending to 3.4%.
 */
class MerchantCategorizerTest {

    private static String cat(String merchant) {
        return MerchantCategorizer.categorize(merchant).orElse("Other");
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource(delimiter = '|', value = {
            // brands, however the rail spells them
            "Paid to MAKEMYTRIP INDIA PAYU      | Travel",
            "Paid to IRCTC Ticketing            | Travel",
            "Paid to APPLE MEDIA SERVICES       | Entertainment",
            "Paid to SPOTIFY INDIA PVT LTD      | Entertainment",
            "Paid to BLINKIT COMMERCE PRIVATE   | Groceries",
            "UPI/DR/412345/SWIGGY/swiggy@icici  | Food",
            "Paid - Mobile Recharge             | Bills",
            "Paid to Passport Seva Project      | Bills",
            "Paid to TCS iON                    | Education",
            "Paid to MSRTC                      | Travel",
            // local shops, by what their name says they sell
            "Paid to Noor bakery show room      | Food",
            "Paid to KABUL_DARBAR_RESTAURANT_   | Food",
            "Paid to Hotel Green Park           | Food",
            "Paid to Gupta Bikaner &Sweet 2     | Food",
            "Paid to Laxmi vadapav centre       | Food",
            "Paid to Ravi medicose              | Health",
            "Paid to Sai madical sotre          | Health",
            "Paid to BALAJI SUPER MARKET        | Groceries",
            "Paid to ALI FRUIT TRADING CO       | Groceries",
            "Paid to HP PETROL PUMP             | Transport",
            "Paid to Sheetal Petroleum          | Transport",
            "Paid to S K AUTO CARE              | Transport",
            "Paid to City salon                 | Shopping",
            "Paid to Universal Book Mall        | Shopping",
            "Paid to SHOW CITY GACHIBOWLI       | Entertainment",
            "Paid to METROPOLITAN COMMISSIONER  | Bills",
    })
    void recognisesBrandsAndShops(String merchant, String category) {
        assertThat(cat(merchant)).isEqualTo(category);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Paid to ******7892",                      // contact masked by the UPI app
            "Received from ******1317",
            "Paid to 9812345678ptyes",                 // phone-number UPI id
            "Paid to 9812345678901ptyes",
            "Paid to 9812345678@ybl",
            "Paid to RAHUL KUMAR SHARMA",
            "Paid to Priya Nair",
            "Paid to Mr Amit Suresh Patil",
            "Paid to Mohd Imran",                       // honorific + one name
            "Paid to MD SALIM",
    })
    void recognisesPayingAPerson(String merchant) {
        assertThat(cat(merchant)).isEqualTo(MerchantCategorizer.PEOPLE);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Paid to SARA ENTERPRISES",                 // a business, kind unknown
            "Paid to OTT commerce solutions Pvt Ltd",
            "Paid to Jamilbhai Bhajewale",              // a seller named by his wares
            "Paid to Blinko",                           // one word: shop or person?
            "Paid to MH 12 RP 4164",
            "Paid to MD",
    })
    void leavesWhatTheNameCannotSettle(String merchant) {
        assertThat(cat(merchant)).isEqualTo("Other");
    }

    @Test
    void matchesWholeWordsOnly() {
        // "ola" used to fire inside other words
        assertThat(cat("Paid to Kolar Gold Traders")).isEqualTo("Other");
        assertThat(cat("Paid to OLA CABS")).isEqualTo("Transport");
    }

    @Test
    void stripsTheRailBeforeReadingTheName() {
        assertThat(MerchantCategorizer.payeeOf("Paid to AQsa bakery")).isEqualTo("AQsa bakery");
        assertThat(MerchantCategorizer.payeeOf("Received from ******1317")).isEqualTo("******1317");
        assertThat(MerchantCategorizer.payeeOf("UPI/DR/412345/SWIGGY")).isEqualTo("SWIGGY");
    }

    @Test
    void nothingToReadIsUnknown() {
        assertThat(MerchantCategorizer.categorize(null)).isEmpty();
        assertThat(MerchantCategorizer.categorize("  ")).isEmpty();
    }
}
