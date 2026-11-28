package com.fintwin.agent;

import com.fintwin.AbstractIntegrationTest;
import com.fintwin.model.Transaction;
import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.service.CategoryService;
import com.fintwin.service.CategorySuggestionService;
import com.fintwin.util.Categorized;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.time.LocalDate;
import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;

/** After an import, the sorting agent sorts what the model is sure of and the watch agent flags what's unusual. */
@SuppressWarnings({"unchecked", "rawtypes"})
class ImportAgentsIntegrationTest extends AbstractIntegrationTest {

    @MockitoBean private CategorySuggestionService suggestions;
    @Autowired private TransactionRepository transactions;
    @Autowired private CategoryService categories;

    /** The model is sure only about payees whose name contains QZX. */
    @BeforeEach
    void modelIsSureAboutQzx() {
        org.mockito.Mockito.doAnswer(inv -> {
            Map<String, String> out = new HashMap<>();
            for (String m : (Collection<String>) inv.getArgument(0))
                if (m.toUpperCase().contains("QZX")) out.put(categories.normalizeMerchant(m), "Groceries");
            return out;
        }).when(suggestions).sureSuggestions(any());
    }

    private <T> ResponseEntity<T> call(String token, HttpMethod method, String path, Object body, Class<T> type) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(MediaType.APPLICATION_JSON);
        return restTemplate.exchange(baseUrl() + path, method, new HttpEntity<>(body, h), type);
    }

    private Map importRows(String token, List<Map<String, Object>> rows) {
        ResponseEntity<Map> r = call(token, HttpMethod.POST, "/api/v1/transactions/batch?accountType=BANK", rows, Map.class);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.OK);
        return r.getBody();
    }

    private static Map<String, Object> row(LocalDate date, String merchant, double amount) {
        return Map.of("date", date.toString(), "merchant", merchant, "amount", amount);
    }

    private List<Transaction> rowsOf(String email, String merchantPart) {
        User u = userRepository.findByEmail(email).orElseThrow();
        return transactions.findByUser(u).stream()
                .filter(t -> t.getMerchant() != null && t.getMerchant().toUpperCase().contains(merchantPart)).toList();
    }

    private List<String> bell(String token) {
        List<Map> items = call(token, HttpMethod.GET, "/api/v1/notifications", null, List.class).getBody();
        return items.stream().map(m -> (String) m.get("message")).toList();
    }

    @Test
    void sortsOnlyWhatTheModelIsSureOfAndLetsTheUserConfirmIt() {
        String email = "agent-sort@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        LocalDate d = LocalDate.now().minusDays(3);

        importRows(token, List.of(
                row(d, "UPI/DR/1/QZX VRLM LLP", -420),
                row(d, "UPI/DR/2/QZX VRLM LLP", -380),
                row(d, "UPI/DR/3/WVB KLMNO LLP", -260)));

        assertThat(rowsOf(email, "QZX")).allSatisfy(t -> {
            assertThat(t.getCategory()).isEqualTo("Groceries");
            assertThat(t.getCategorySource()).isEqualTo(Categorized.LLM_AUTO);
            assertThat(t.getCategoryReview()).isNull();
        });
        // Not sure → left for the user, untouched
        assertThat(rowsOf(email, "WVB")).allSatisfy(t -> assertThat(t.getCategorySource()).isNotEqualTo(Categorized.LLM_AUTO));

        assertThat(bell(token)).anyMatch(m -> m.startsWith("FinTwin sorted 2 payments to 1 payee"));

        List<Map> review = call(token, HttpMethod.GET, "/api/v1/transactions/auto-sorted", null, List.class).getBody();
        assertThat(review).hasSize(1);
        assertThat(review.get(0)).containsEntry("category", "Groceries").containsEntry("count", 2);

        Map confirmed = call(token, HttpMethod.POST, "/api/v1/transactions/auto-sorted/confirm",
                Map.of("merchants", List.of(review.get(0).get("merchant"))), Map.class).getBody();
        assertThat(confirmed).containsEntry("confirmed", 2);
        assertThat(rowsOf(email, "QZX")).allSatisfy(t -> assertThat(t.getCategoryReview()).isEqualTo(Categorized.CONFIRMED));
        assertThat(call(token, HttpMethod.GET, "/api/v1/transactions/auto-sorted", null, List.class).getBody()).isEmpty();

        // Confirming taught a rule: the next payment from that payee is sorted by it, not the model.
        importRows(token, List.of(row(d.plusDays(1), "UPI/DR/4/QZX VRLM LLP", -150)));
        Transaction next = rowsOf(email, "QZX").stream().filter(t -> t.getCategoryReview() == null).findFirst().orElseThrow();
        assertThat(next.getCategory()).isEqualTo("Groceries");
        assertThat(next.getCategorySource()).isEqualTo(Categorized.LEARNED);
    }

    @Test
    void doubleChecksTheRulesGuessesButNeverAPersonItIsSureOf() {
        List<String> asked = new ArrayList<>();
        org.mockito.Mockito.doAnswer(inv -> {
            Map<String, String> out = new HashMap<>();
            for (String m : (Collection<String>) inv.getArgument(0)) {
                asked.add(m.toUpperCase());
                if (m.toUpperCase().contains("SUNRISE INTERIORS")) out.put(categories.normalizeMerchant(m), "Housing");
                if (m.toUpperCase().contains("SRI SAI MEDICALS")) out.put(categories.normalizeMerchant(m), "Health");
            }
            return out;   // nothing for people: the model answers Unknown for a name
        }).when(suggestions).sureSuggestions(any());

        String email = "agent-guess@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        LocalDate d = LocalDate.now().minusDays(2);
        importRows(token, List.of(
                row(d, "Paid to SUNRISE INTERIORS AND MODULAR KITCHENS", -65_000),
                row(d, "Paid to RAMESH KUMAR PAWAR", -5_000),
                row(d, "Paid to 9876543210@ybl", -2_000),
                row(d, "Paid to SRI SAI MEDICALS", -640)));

        // The person rule's misreading is fixed, and shows up for review
        Transaction interiors = rowsOf(email, "SUNRISE").get(0);
        assertThat(interiors.getCategory()).isEqualTo("Housing");
        assertThat(interiors.getCategorySource()).isEqualTo(Categorized.LLM_AUTO);
        // A person stays a person; a phone-number UPI ID is never even asked about
        assertThat(rowsOf(email, "RAMESH").get(0).getCategory()).isEqualTo("People");
        assertThat(rowsOf(email, "9876543210").get(0).getCategory()).isEqualTo("People");
        assertThat(asked).noneMatch(m -> m.contains("9876543210"));
        // A guess the model agrees with keeps its rule as the source
        assertThat(rowsOf(email, "SRI SAI").get(0).getCategorySource()).isNotEqualTo(Categorized.LLM_AUTO);

        assertThat(bell(token)).anyMatch(m -> m.startsWith("FinTwin sorted 1 payment to 1 payee (SUNRISE INTERIORS"));
    }

    @Test
    void aWrongSortIsCorrectedForEveryPaymentToThatPayeeAndRemembered() {
        String email = "agent-correct@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        LocalDate d = LocalDate.now().minusDays(4);
        importRows(token, List.of(
                row(d, "UPI/DR/21/QZX HLTH LLP", -900),
                row(d.plusDays(1), "UPI/DR/22/QZX HLTH LLP", -700)));

        Map r = call(token, HttpMethod.POST, "/api/v1/transactions/auto-sorted/correct",
                Map.of("merchant", "UPI/DR/21/QZX HLTH LLP", "category", "Health"), Map.class).getBody();
        assertThat(r).containsEntry("corrected", 2);
        assertThat(rowsOf(email, "QZX")).allSatisfy(t -> {
            assertThat(t.getCategory()).isEqualTo("Health");
            assertThat(t.getCategoryReview()).isEqualTo(Categorized.CORRECTED);
        });

        importRows(token, List.of(row(d.plusDays(2), "UPI/DR/23/QZX HLTH LLP", -300)));
        assertThat(rowsOf(email, "QZX")).allSatisfy(t -> assertThat(t.getCategory()).isEqualTo("Health"));
    }

    @Test
    void neverTouchesACategoryTheUserChose() {
        String email = "agent-user-choice@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        LocalDate d = LocalDate.now().minusDays(2);
        importRows(token, List.of(row(d, "UPI/DR/5/QZX TRQ LLP", -300)));
        Transaction t = rowsOf(email, "QZX").get(0);

        // The user moves it back to Other themselves
        call(token, HttpMethod.PATCH, "/api/v1/transactions/" + t.getId() + "/category",
                Map.of("category", "Other", "applyToSimilar", false, "remember", false), Map.class);
        importRows(token, List.of(row(d, "UPI/DR/6/PLK NMR LLP", -50)));

        Transaction after = transactions.findById(t.getId()).orElseThrow();
        assertThat(after.getCategory()).isEqualTo("Other");
    }

    @Test
    void flagsAnUnusualPaymentOnceAndHidesItWhenDismissed() {
        String email = "agent-watch@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        LocalDate d = LocalDate.now().minusDays(20);

        // Five ₹500 payments, then ₹20,000: over 4x the payee's average even
        // with the big one counted in it, which makes it high severity.
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 0; i < 5; i++) rows.add(row(d.plusDays(i * 3), "HJK DFG LLP", -500));
        rows.add(row(d.plusDays(16), "HJK DFG LLP", -20000));
        importRows(token, rows);

        List<String> first = bell(token);
        assertThat(first.stream().filter(m -> m.startsWith("Unusual payment: ₹20,000"))).hasSize(1);

        // Importing the same statement again raises nothing new
        importRows(token, rows);
        assertThat(bell(token).stream().filter(m -> m.startsWith("Unusual payment"))).hasSize(1);

        // "That's fine" on the Insights page hides the bell alert too
        List<Map> found = call(token, HttpMethod.GET, "/api/v1/anomalies", null, List.class).getBody();
        Map spike = found.stream().filter(a -> "merchant_spike".equals(a.get("type"))).findFirst().orElseThrow();
        call(token, HttpMethod.POST, "/api/v1/anomalies/dismiss",
                Map.of("type", spike.get("type"), "merchant", spike.get("merchant")), String.class);
        assertThat(bell(token)).noneMatch(m -> m.startsWith("Unusual payment"));
    }

    @Test
    void aBrokenModelNeverFailsTheImport() {
        org.mockito.Mockito.doThrow(new IllegalStateException("model down")).when(suggestions).sureSuggestions(any());
        String email = "agent-broken@example.com";
        String token = seedUserAndGetToken(email, "Test@1234");
        Map result = importRows(token, List.of(row(LocalDate.now().minusDays(1), "UPI/DR/7/QZX BRV LLP", -99)));
        assertThat(result).containsEntry("imported", 1);
        assertThat(rowsOf(email, "QZX").get(0).getCategorySource()).isNotEqualTo(Categorized.LLM_AUTO);
    }
}
