package com.fintwin.service;

import com.fintwin.util.Categorized;
import com.fintwin.util.MerchantCategorizer;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** Every automatic category says which rule chose it. */
class CategorySourceTest {

    private final CategoryService categories = new CategoryService();

    @Test
    void eachRuleNamesItself() {
        assertThat(MerchantCategorizer.classify("Paid to SPOTIFY INDIA PVT LTD")).contains(new Categorized("Entertainment", Categorized.BRAND));
        assertThat(MerchantCategorizer.classify("Paid to Noor bakery show room")).contains(new Categorized("Food", Categorized.SHOP_WORD));
        assertThat(MerchantCategorizer.classify("Paid to RAHUL KUMAR SHARMA")).contains(new Categorized(MerchantCategorizer.PEOPLE, Categorized.PERSON));
        assertThat(MerchantCategorizer.classify("Paid to SARA ENTERPRISES")).isEmpty();
    }

    @Test
    void theServiceAddsLearnedRulesSelfTransfersAndOther() {
        Map<String, String> learned = Map.of("paid to sara enterprises", "Groceries");
        assertThat(categories.classify("Paid to SARA ENTERPRISES", learned)).isEqualTo(new Categorized("Groceries", Categorized.LEARNED));
        assertThat(categories.classify("Transfer to self HDFC", Map.of())).isEqualTo(new Categorized("Transfer", Categorized.SELF_TRANSFER));
        assertThat(categories.classify("Paid to SARA ENTERPRISES", Map.of())).isEqualTo(Categorized.other());
        assertThat(categories.classify(null, Map.of())).isEqualTo(Categorized.other());
    }

    @Test
    void categorizeStillReturnsJustTheCategory() {
        assertThat(categories.categorize("Paid to Noor bakery show room", Map.of())).isEqualTo("Food");
        assertThat(MerchantCategorizer.categorize("Paid to SARA ENTERPRISES")).isEmpty();
    }

    @Test
    void statsLeaveOutSandboxAndSampleDataAndRateOnlyExplicitReviews() {
        List<Object[]> rows = List.of(
                new Object[]{"STATEMENT", Categorized.BRAND, null, true, 50L},
                new Object[]{"STATEMENT", Categorized.BRAND, Categorized.CONFIRMED, true, 9L},
                new Object[]{"STATEMENT", Categorized.BRAND, Categorized.CORRECTED, true, 1L},
                new Object[]{"EMAIL", Categorized.NONE, Categorized.CORRECTED, false, 30L},
                new Object[]{"EMAIL", Categorized.NONE, Categorized.APPLIED, true, 70L},
                new Object[]{"AA", Categorized.BANK_KEYWORD, Categorized.CORRECTED, true, 500L},   // sandbox
                new Object[]{"SEED", Categorized.SEED, null, true, 12L},
                new Object[]{"MANUAL", Categorized.USER, null, true, 4L});

        Map<String, Object> s = CategoryLabelService.stats(rows, 3);

        assertThat(s).containsEntry("transactions", 676L).containsEntry("excludedSampleData", 512L)
                .containsEntry("reviewedByUsers", 110L)
                .containsEntry("trainingReadyLabels", 80L)          // consenting users' reviews only
                .containsEntry("usersConsentedToTraining", 3L);
        @SuppressWarnings("unchecked")
        var methods = (List<Map<String, Object>>) s.get("methods");
        assertThat(methods).extracting(m -> m.get("method")).containsExactly("NONE", "BRAND", "USER");
        assertThat(methods.get(0)).containsEntry("correctionRate", 100.0).containsEntry("appliedToSimilar", 70L);
        assertThat(methods.get(1)).containsEntry("correctionRate", 10.0);
        assertThat(methods.get(2)).containsEntry("correctionRate", null);
    }
}
