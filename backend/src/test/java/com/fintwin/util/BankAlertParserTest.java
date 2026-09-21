package com.fintwin.util;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Alert wording modelled on the formats Indian banks send. These are written
 * for the test, not copied from real customer mail, so the first real alerts
 * from each bank should be checked against the "unmatched" log.
 */
class BankAlertParserTest {

    private static final LocalDate RECEIVED = LocalDate.of(2026, 9, 21);

    private static BankAlertParser.Alert parse(String subject, String body) {
        return BankAlertParser.parse(subject, body, RECEIVED).orElseThrow();
    }

    // ── Money out ────────────────────────────────────────────────────────────

    @Test
    void hdfcUpiDebitToVpa() {
        var a = parse("You have done a UPI txn. Check details!",
                "Dear Customer,\nRs.649.00 has been debited from account **1234 to VPA netflix@icici "
                + "NETFLIX on 21-09-26. Your UPI transaction reference number is 426512345678.\n"
                + "If you did not authorize this transaction, please report it immediately.");
        assertThat(a.amount()).isEqualTo(-649.0);
        assertThat(a.counterparty()).isEqualTo("NETFLIX");
        assertThat(a.date()).isEqualTo(LocalDate.of(2026, 9, 21));
        assertThat(a.last4()).isEqualTo("1234");
        assertThat(a.card()).isFalse();
        assertThat(a.channel()).isEqualTo("UPI");
    }

    @Test
    void hdfcCreditCardSpend() {
        var a = parse("Alert : Update on your HDFC Bank Credit Card",
                "Dear Card Member, Thank you for using your HDFC Bank Credit Card ending 5678 for "
                + "Rs 2,499.00 at AMAZON PAY INDIA on 20-09-2026 18:42:10. Authorization code:- 012345");
        assertThat(a.amount()).isEqualTo(-2499.0);
        assertThat(a.counterparty()).isEqualTo("AMAZON PAY INDIA");
        assertThat(a.date()).isEqualTo(LocalDate.of(2026, 9, 20));
        assertThat(a.last4()).isEqualTo("5678");
        assertThat(a.card()).isTrue();
    }

    @Test
    void iciciCardSpendNamesTheMerchantLast() {
        var a = parse("Transaction alert for your ICICI Bank Credit Card",
                "INR 1,250.00 spent using ICICI Bank Card XX9012 on 19-Sep-26 on SWIGGY. "
                + "Avl Limit: INR 1,23,456.00. If not you, call 18002662.");
        assertThat(a.amount()).isEqualTo(-1250.0);
        assertThat(a.counterparty()).isEqualTo("SWIGGY");
        assertThat(a.date()).isEqualTo(LocalDate.of(2026, 9, 19));
        assertThat(a.last4()).isEqualTo("9012");
        assertThat(a.card()).isTrue();
    }

    @Test
    void iciciAccountDebitWithInfoLine() {
        var a = parse("Transaction alert",
                "Dear Customer, Your ICICI Bank Account XX345 has been debited with INR 450.00 on "
                + "18-Sep-26. Info: UPI-512345678901-ZOMATO. The Available Balance is INR 12,000.00.");
        assertThat(a.amount()).isEqualTo(-450.0);
        // the rail and reference number are stripped; the payee is what's left
        assertThat(a.counterparty()).isEqualTo("ZOMATO");
        assertThat(a.last4()).isEqualTo("345");   // ICICI masks to three digits
        assertThat(a.card()).isFalse();
    }

    @Test
    void sbiTransferDebitWithCompactDate() {
        var a = parse("Transaction alert from SBI",
                "Dear Customer, Your A/C XXXXX6789 has a debit by transfer of Rs 3,000.00 on 17Sep26 "
                + "transfer to RAHUL KUMAR. Avl Bal Rs 45,210.55.");
        assertThat(a.amount()).isEqualTo(-3000.0);
        assertThat(a.counterparty()).isEqualTo("RAHUL KUMAR");
        assertThat(a.date()).isEqualTo(LocalDate.of(2026, 9, 17));
        assertThat(a.last4()).isEqualTo("6789");
    }

    @Test
    void axisAtmWithdrawal() {
        var a = parse("Debit transaction alert",
                "INR 2,000.00 withdrawn at ATM S1ANMU12 BANGALORE from A/c no. XX4321 on 16-09-2026.");
        assertThat(a.amount()).isEqualTo(-2000.0);
        assertThat(a.channel()).isEqualTo("ATM");
        assertThat(a.last4()).isEqualTo("4321");
    }

    // ── Money in ─────────────────────────────────────────────────────────────

    @Test
    void neftSalaryCreditNamesThePayerNotTheRail() {
        var a = parse("Credit alert",
                "Rs. 1,20,000.00 credited to your A/c XX1234 on 01-09-26 by NEFT from ACME TECHNOLOGIES PVT LTD.");
        assertThat(a.amount()).isEqualTo(120_000.0);
        assertThat(a.counterparty()).isEqualTo("ACME TECHNOLOGIES PVT LTD");
        assertThat(a.channel()).isEqualTo("NEFT");
    }

    @Test
    void upiCreditByVpa() {
        var a = parse("You have received money",
                "Rs. 500.00 is successfully credited to your account **1234 by VPA mom@okhdfc "
                + "SUNITA DEVI on 15-09-26.");
        assertThat(a.amount()).isEqualTo(500.0);
        assertThat(a.counterparty()).isEqualTo("SUNITA DEVI");
    }

    @Test
    void cardRefundIsACreditOnTheCard() {
        var a = parse("Refund alert",
                "Refund of INR 499.00 has been credited to your ICICI Bank Credit Card XX9012 on 12-Sep-26 from AMAZON.");
        assertThat(a.amount()).isEqualTo(499.0);
        assertThat(a.card()).isTrue();
        assertThat(a.counterparty()).isEqualTo("AMAZON");
    }

    // ── Refusals ─────────────────────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {
            "Your OTP for the transaction of Rs 649.00 at NETFLIX is 123456. Do not share it.",
            "Your transaction of Rs 500.00 at AMAZON was declined due to incorrect PIN.",
            "Your UPI payment of Rs 250.00 to SWIGGY failed. Any amount debited will be refunded.",
            "Your HDFC Bank Credit Card statement for Sep 2026 is ready. Total amount due Rs 12,450.00.",
            "Payment of Rs 12,450.00 is due on 05-10-26 for your credit card XX5678.",
            "Rs 649.00 will be debited on 25-09-26 from your A/c XX1234 towards NETFLIX mandate.",
            "Congratulations! You are pre-approved for a personal loan of Rs 5,00,000.",
    })
    void refusesAnythingThatIsNotACompletedTransaction(String body) {
        assertThat(BankAlertParser.parse("Alert", body, RECEIVED)).isEmpty();
    }

    @Test
    void refusesOnTheSubjectAlone() {
        assertThat(BankAlertParser.parse("OTP for your transaction",
                "Rs 649.00 debited from A/c XX1234", RECEIVED)).isEmpty();
    }

    @Test
    void aBalanceIsNeverTakenForTheTransaction() {
        var a = parse("Alert", "Avl Bal Rs 45,210.55 after Rs 300.00 debited from A/c XX1234 to UBER on 21-09-26.");
        assertThat(a.amount()).isEqualTo(-300.0);
    }

    @Test
    void aMarketingFooterDoesNotSinkAGenuineAlert() {
        var a = parse("Transaction alert",
                "Rs.649.00 has been debited from account **1234 to VPA netflix@icici NETFLIX on 21-09-26.\n"
                + "Never share your OTP. Get exclusive offers on our credit cards — you may be eligible for more.");
        assertThat(a.amount()).isEqualTo(-649.0);
    }

    @Test
    void anImplausibleDateFallsBackToWhenTheEmailArrived() {
        // An alert goes out within minutes; a date months away is a misread
        var a = parse("Alert", "Rs 300.00 debited from A/c XX1234 to UBER on 21-01-25.");
        assertThat(a.date()).isEqualTo(RECEIVED);
    }

    @Test
    void noAmountNoAlert() {
        assertThat(BankAlertParser.parse("Welcome to net banking",
                "Your account has been debited? No — this is a newsletter.", RECEIVED)).isEmpty();
    }
}
