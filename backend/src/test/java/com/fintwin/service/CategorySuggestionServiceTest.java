package com.fintwin.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CategorySuggestionServiceTest {

    private RestTemplate ai;
    private CategorySuggestionService service;

    @BeforeEach
    void setUp() {
        ai = mock(RestTemplate.class);
        service = new CategorySuggestionService(ai, "http://ai", new CategoryService());
    }

    private void aiReplies(Map<String, Object> suggestions, boolean complete) {
        when(ai.postForObject(eq("http://ai/categories/suggest"), any(), eq(Map.class)))
                .thenReturn(Map.of("suggestions", suggestions, "complete", complete));
    }

    @Test
    @SuppressWarnings("unchecked")
    void sendsPayeeNamesOnceAndKeysResultsByMerchant() {
        Map<String, Object> got = new HashMap<>();
        got.put("DECATHLON SPORTS", "Shopping");
        got.put("SARA ENTERPRISES", null);                       // model couldn't tell
        aiReplies(got, true);

        var s = service.suggest(List.of("Paid to DECATHLON SPORTS", "Paid to  decathlon sports", "Paid to SARA ENTERPRISES"));

        verify(ai).postForObject(anyString(), argThat(body ->
                ((Map<String, List<String>>) body).get("payees").equals(List.of("DECATHLON SPORTS", "SARA ENTERPRISES"))), eq(Map.class));
        assertThat(s.byMerchant()).containsExactlyEntriesOf(Map.of("paid to decathlon sports", "Shopping"));
        assertThat(s.complete()).isTrue();
        assertThat(service.shown("Paid to DECATHLON SPORTS")).contains("Shopping");
        assertThat(service.shown("Paid to SARA ENTERPRISES")).isEmpty();
    }

    @Test
    void onlyAnswersTheModelWasSureOfCanBeAppliedOnTheirOwn() {
        when(ai.postForObject(eq("http://ai/categories/suggest"), any(), eq(Map.class)))
                .thenReturn(Map.of("suggestions", Map.of("Swiggy", "Food", "Krishna Enterprises", "Shopping"),
                        "sure", Map.of("Swiggy", true, "Krishna Enterprises", false), "complete", true));

        var sure = service.sureSuggestions(List.of("Paid to Swiggy", "Paid to Krishna Enterprises"));

        assertThat(sure).containsExactlyEntriesOf(Map.of("paid to swiggy", "Food"));
        // Both are still offered as suggestions for the user
        assertThat(service.shown("Paid to Krishna Enterprises")).contains("Shopping");
    }

    @Test
    void anOlderAiServiceWithoutTheSureFlagMeansNothingIsAppliedOnItsOwn() {
        aiReplies(Map.of("Swiggy", "Food"), true);
        assertThat(service.sureSuggestions(List.of("Paid to Swiggy"))).isEmpty();
        assertThat(service.shown("Paid to Swiggy")).contains("Food");
    }

    @Test
    void theModelIsNotAskedAgainAboutANameItAlreadyAnswered() {
        aiReplies(Map.of("Dominos Pizza", "Food"), true);
        service.suggest(List.of("Paid to Dominos Pizza"));
        var again = service.suggest(List.of("Paid to Dominos Pizza"));
        verify(ai, times(1)).postForObject(anyString(), any(), eq(Map.class));
        assertThat(again.byMerchant()).containsEntry("paid to dominos pizza", "Food");
    }

    @Test
    void anUnreachableAiServiceMeansNoSuggestionsNotAnError() {
        when(ai.postForObject(anyString(), any(), eq(Map.class))).thenThrow(new ResourceAccessException("down"));
        var s = service.suggest(List.of("Paid to Dominos Pizza"));
        assertThat(s.byMerchant()).isEmpty();
        assertThat(s.complete()).isFalse();
        // and it asks again next time rather than caching the failure
        aiReplies(Map.of("Dominos Pizza", "Food"), true);
        assertThat(service.suggest(List.of("Paid to Dominos Pizza")).byMerchant()).isNotEmpty();
    }
}
