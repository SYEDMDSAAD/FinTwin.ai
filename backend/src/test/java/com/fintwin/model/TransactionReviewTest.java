package com.fintwin.model;

import com.fintwin.util.Categorized;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** What a user's category change records against FinTwin's own prediction. */
class TransactionReviewTest {

    private static Transaction predicted(String category, String source) {
        Transaction t = new Transaction();
        t.applyPrediction(new Categorized(category, source));
        return t;
    }

    @Test
    void changingThePredictionIsACorrectionAndKeepsWhatWasPredicted() {
        Transaction t = predicted("Other", Categorized.NONE);
        t.recordReview("Food", false);
        assertThat(t.getCategory()).isEqualTo("Food");
        assertThat(t.getPredictedCategory()).isEqualTo("Other");
        assertThat(t.getCategorySource()).isEqualTo(Categorized.NONE);
        assertThat(t.getCategoryReview()).isEqualTo(Categorized.CORRECTED);
        assertThat(t.getCategoryReviewedAt()).isNotNull();
    }

    @Test
    void choosingThePredictedCategoryConfirmsIt() {
        Transaction t = predicted("Food", Categorized.SHOP_WORD);
        t.recordReview("food", false);
        assertThat(t.getCategoryReview()).isEqualTo(Categorized.CONFIRMED);
    }

    @Test
    void applyToSimilarIsKeptApartFromAReviewOfThisRow() {
        Transaction t = predicted("Other", Categorized.NONE);
        t.recordReview("Groceries", true);
        assertThat(t.getCategoryReview()).isEqualTo(Categorized.APPLIED);
    }

    @Test
    void aRowFromBeforeTrackingTreatsItsOldCategoryAsThePrediction() {
        Transaction t = new Transaction();
        t.setCategory("Shopping");
        t.recordReview("Groceries", false);
        assertThat(t.getPredictedCategory()).isEqualTo("Shopping");
        assertThat(t.getCategorySource()).isEqualTo(Categorized.LEGACY);
        assertThat(t.getCategoryReview()).isEqualTo(Categorized.CORRECTED);
    }

    @Test
    void theUsersOwnCategoryHasNoPrediction() {
        Transaction t = new Transaction();
        t.applyUserCategory("Rent");
        assertThat(t.getPredictedCategory()).isNull();
        assertThat(t.getCategorySource()).isEqualTo(Categorized.USER);
    }
}
