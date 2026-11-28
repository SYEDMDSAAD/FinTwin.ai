package com.fintwin.service;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import com.fintwin.model.User;
import com.fintwin.repository.HoldingTransactionRepository;
import com.fintwin.repository.InvestmentRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.service.CasImportService.Holding;
import com.fintwin.service.CasImportService.Statement;
import com.fintwin.service.CasImportService.Txn;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.util.LinkedMultiValueMap;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** CAS import with made-up holdings; the AI service (the PDF reader) is unreachable here, as in CI. */
class CasImportIntegrationTest extends AbstractIntegrationTest {

    @Autowired CasImportService cas;
    @Autowired UserRepository users;
    @Autowired InvestmentRepository investments;
    @Autowired HoldingTransactionRepository txns;

    static final LocalDate JAN = LocalDate.of(2026, 1, 5), FEB = LocalDate.of(2026, 2, 5), MAR = LocalDate.of(2026, 3, 5);

    static Holding flexiCap(double units, double value, double cost, LocalDate asOf, List<Txn> lines) {
        return new Holding("mf", "Parag Parikh Flexi Cap Fund - Direct Plan Growth", "INF879O01027", "122639",
                null, "5678", "EQUITY", units, 90.0, asOf, value, cost, lines);
    }

    static Txn sip(LocalDate d, double units) { return new Txn(d, "PURCHASE_SIP", 5000.0, units, 80.0); }

    private User user(String email) {
        seedUserAndGetToken(email, "Test@1234");
        return users.findByEmail(email).orElseThrow();
    }

    @Test
    void aNewerStatementUpdatesTheHoldingAndAddsOnlyTheNewTransactions() {
        User u = user("cas-twice@example.com");

        var first = cas.apply(u, new Statement("CAMS", true, FEB,
                List.of(flexiCap(123.5, 10_400, 10_000, FEB, List.of(sip(JAN, 62.5), sip(FEB, 61))))));
        assertThat(first.added()).isEqualTo(1);
        assertThat(first.transactions()).isEqualTo(2);

        var second = cas.apply(u, new Statement("CAMS", true, MAR,
                List.of(flexiCap(183, 16_470, 15_000, MAR, List.of(sip(JAN, 62.5), sip(FEB, 61), sip(MAR, 59.5))))));
        assertThat(second.added()).isZero();
        assertThat(second.updated()).isEqualTo(1);
        assertThat(second.transactions()).isEqualTo(1);

        List<Investment> mine = investments.findByUser(u);
        assertThat(mine).singleElement().satisfies(i -> {
            assertThat(i.getType()).isEqualTo("Mutual Fund");
            assertThat(i.getTickerCode()).isEqualTo("122639");
            assertThat(i.getUnits()).isEqualTo(183.0);
            assertThat(i.getCurrentValue()).isEqualTo(16_470.0);
            assertThat(i.getInvestedAmount()).isEqualTo(15_000.0);
            assertThat(i.getPurchaseDate()).isEqualTo(JAN);
            assertThat(i.getUnitsAsOf()).isEqualTo(MAR);
            assertThat(i.getSource()).isEqualTo("CAMS");
            assertThat(i.getAssetClass()).isEqualTo("EQUITY");
        });
        assertThat(txns.findByInvestmentOrderByDateAsc(mine.get(0))).extracting(HoldingTransaction::getDate)
                .containsExactly(JAN, FEB, MAR);
    }

    @Test
    void aFundAddedByHandIsTakenOverNotDuplicated() {
        User u = user("cas-takeover@example.com");
        Investment manual = new Investment();
        manual.setUser(u);
        manual.setName("PPFAS flexi");
        manual.setType("Mutual Fund");
        manual.setTickerCode("122639");
        manual.setInvestedAmount(9_000.0);
        investments.save(manual);

        var r = cas.apply(u, new Statement("CAMS", true, MAR, List.of(
                flexiCap(183, 16_470, 15_000, MAR, List.of()),
                new Holding("mf", "Fully sold fund", "INF000000001", "100001", null, "1111", "DEBT", 0.0, 10.0, MAR, 0.0, 0.0,
                        List.of(new Txn(JAN, "REDEMPTION", -2000.0, -200.0, 10.0))))));

        assertThat(r.added()).isZero();
        assertThat(r.updated()).isEqualTo(1);
        assertThat(investments.findByUser(u)).singleElement().satisfies(i -> {
            assertThat(i.getId()).isEqualTo(manual.getId());
            assertThat(i.getName()).isEqualTo("PPFAS flexi");   // the user's own name for it stays
            assertThat(i.getInvestedAmount()).isEqualTo(15_000.0);
        });
    }

    @Test
    void theImportEndpointSaysWhenTheReaderIsDown() {
        String token = seedUserAndGetToken("cas-endpoint@example.com", "Test@1234");
        LinkedMultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new ByteArrayResource("%PDF-1.4 fake".getBytes()) {
            @Override public String getFilename() { return "cas.pdf"; }
        });
        form.add("password", "ABCDE1234F");
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.MULTIPART_FORM_DATA);
        @SuppressWarnings("rawtypes")
        ResponseEntity<Map> r = restTemplate.exchange(baseUrl() + "/api/v1/portfolio/import-cas", HttpMethod.POST,
                new HttpEntity<>(form, h), Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(r.getBody()).containsEntry("code", "reader_unavailable");
    }
}
