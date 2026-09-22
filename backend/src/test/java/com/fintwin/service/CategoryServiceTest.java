package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.model.UserMerchantCategory;
import com.fintwin.repository.UserMerchantCategoryRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CategoryServiceTest {

    @Mock private UserMerchantCategoryRepository learnedRepo;

    @InjectMocks private CategoryService service;

    // ── global keyword rules (unchanged behavior) ─────────────────────────────

    @Test
    void categorize_matchesGlobalKeywordRules() {
        assertThat(service.categorize("Swiggy Order 123")).isEqualTo("Food");
        // Rides are Transport; Travel is trips (flights, trains, hotels)
        assertThat(service.categorize("UBER TRIP BLR")).isEqualTo("Transport");
        // Paying a person is its own category, counted as spending
        assertThat(service.categorize("Some Random Person")).isEqualTo("People");
        assertThat(service.categorize("SARA ENTERPRISES")).isEqualTo("Other");
        // own-account moves stay Transfer, excluded from spending
        assertThat(service.categorize("Transfer to self")).isEqualTo("Transfer");
        assertThat(service.categorize(null)).isEqualTo("Other");
    }

    // ── learned rules ─────────────────────────────────────────────────────────

    @Test
    void categorize_learnedRuleBeatsGlobalRules() {
        // "swiggy" would match Food globally, but the user said Bills
        Map<String, String> learned = Map.of("swiggy order 123", "Bills");
        assertThat(service.categorize("Swiggy Order 123", learned)).isEqualTo("Bills");
    }

    @Test
    void categorize_learnedRuleMatchesUnknownPayee() {
        Map<String, String> learned = Map.of("sharma general store", "Groceries");
        assertThat(service.categorize("SHARMA  GENERAL   STORE", learned))
                .isEqualTo("Groceries");
    }

    @Test
    void categorize_learnedRuleMatchesBySubstring() {
        Map<String, String> learned = Map.of("sharma general store", "Groceries");
        assertThat(service.categorize("UPI/DR/12345/Sharma General Store/OKAXIS", learned))
                .isEqualTo("Groceries");
    }

    @Test
    void categorize_fallsBackToGlobalRulesWhenNoLearnedMatch() {
        Map<String, String> learned = Map.of("sharma general store", "Groceries");
        assertThat(service.categorize("Zomato Online", learned)).isEqualTo("Food");
    }

    // ── learnedRulesFor / rememberRule ────────────────────────────────────────

    @Test
    void learnedRulesFor_mapsPatternsToCategories() {
        User user = new User();
        UserMerchantCategory rule = new UserMerchantCategory();
        rule.setUser(user);
        rule.setMerchantPattern("sharma general store");
        rule.setCategory("Groceries");
        when(learnedRepo.findByUser(user)).thenReturn(List.of(rule));

        assertThat(service.learnedRulesFor(user))
                .containsEntry("sharma general store", "Groceries");
    }

    @Test
    void rememberRule_createsNormalizedRule() {
        User user = new User();
        when(learnedRepo.findByUserAndMerchantPattern(user, "sharma general store"))
                .thenReturn(Optional.empty());

        service.rememberRule(user, "  SHARMA  GENERAL Store ", "Groceries");

        ArgumentCaptor<UserMerchantCategory> captor =
                ArgumentCaptor.forClass(UserMerchantCategory.class);
        verify(learnedRepo).save(captor.capture());
        assertThat(captor.getValue().getMerchantPattern())
                .isEqualTo("sharma general store");
        assertThat(captor.getValue().getCategory()).isEqualTo("Groceries");
    }

    @Test
    void rememberRule_updatesExistingRule() {
        User user = new User();
        UserMerchantCategory existing = new UserMerchantCategory();
        existing.setUser(user);
        existing.setMerchantPattern("sharma general store");
        existing.setCategory("Groceries");
        when(learnedRepo.findByUserAndMerchantPattern(user, "sharma general store"))
                .thenReturn(Optional.of(existing));

        service.rememberRule(user, "Sharma General Store", "Food");

        verify(learnedRepo).save(existing);
        assertThat(existing.getCategory()).isEqualTo("Food");
    }
}
