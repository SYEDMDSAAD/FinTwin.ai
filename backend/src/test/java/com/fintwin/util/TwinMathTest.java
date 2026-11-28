package com.fintwin.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TwinMathTest {

    static Transaction t(double amount, LocalDate d, String category, String merchant) {
        Transaction x = new Transaction();
        x.setAmount(amount);
        x.setDate(d);
        x.setCategory(category);
        x.setMerchant(merchant);
        return x;
    }

    @Test
    void roundsLastMonthsSpendingUpToTheNextTenRupees() {
        LocalDate today = LocalDate.of(2026, 11, 27);
        var r = TwinMath.roundUps(List.of(
                t(-243, LocalDate.of(2026, 10, 3), "Food", "SWIGGY"),          // +7
                t(-1_198.5, LocalDate.of(2026, 10, 9), "Shopping", "AMAZON"),  // +1.5
                t(-500, LocalDate.of(2026, 10, 12), "Food", "ZOMATO"),         // exact: nothing
                t(-15_000, LocalDate.of(2026, 10, 1), "Rent", "LANDLORD"),     // rent isn't rounded
                t(-5_003, LocalDate.of(2026, 10, 5), "Investments", "GROWW"),  // nor investing
                t(-99, LocalDate.of(2026, 11, 2), "Food", "CAFE"),             // this month: not yet
                t(40_000, LocalDate.of(2026, 10, 1), "Income", "ACME")), today);
        assertThat(r.month()).isEqualTo("2026-10");
        assertThat(r.amount()).isEqualTo(8.5);
        assertThat(r.payments()).isEqualTo(2);
    }

    @Test
    void readsOnlyWishlistItemsWhoseWaitIsOverAndNeverThePayee() throws Exception {
        var state = new ObjectMapper().readTree("""
                {"wishlist": {
                  "a": {"name": "Headphones", "amount": 3499, "ready_at": "2026-11-25T10:00:00+05:30", "qr": "upi://pay?pa=shop@okaxis"},
                  "b": {"name": "Shoes", "amount": 2000, "ready_at": "2026-11-29T10:00:00+05:30"},
                  "c": {"name": "", "amount": 10, "ready_at": "2026-11-20T10:00:00+05:30"}}}""");
        var ready = TwinMath.readyWishes(state, LocalDateTime.of(2026, 11, 27, 12, 0));
        assertThat(ready).containsExactly(new TwinMath.Wish("Headphones", 3499, "2026-11-25"));
        assertThat(TwinMath.readyWishes(new ObjectMapper().readTree("{}"), LocalDateTime.now())).isEmpty();
    }
}
