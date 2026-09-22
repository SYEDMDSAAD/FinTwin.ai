package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TicketServiceFeedbackTest {

    @Test
    void writesEveryAnswerTheUserGave() {
        String m = TicketService.feedbackMessage(4, List.of("Dashboard", " AI Copilot "),
                "  More bank formats  ", "PDF import was slow");
        assertThat(m).isEqualTo("""
                Rating: 4/5
                Most useful: Dashboard, AI Copilot

                What to improve:
                More bank formats

                What didn't work:
                PDF import was slow""");
    }

    @Test
    void aRatingAloneIsEnough() {
        assertThat(TicketService.feedbackMessage(5, List.of("", " "), " ", null)).isEqualTo("Rating: 5/5");
    }

    @Test
    void rejectsMissingOrOutOfRangeRatings() {
        for (Integer bad : new Integer[]{null, 0, 6})
            assertThatThrownBy(() -> TicketService.feedbackMessage(bad, List.of(), "x", null))
                    .isInstanceOf(BadRequestException.class);
    }

    @Test
    void rejectsOverlongAnswers() {
        String essay = "a".repeat(TicketService.MAX_TEXT + 1);
        assertThatThrownBy(() -> TicketService.feedbackMessage(3, List.of(), essay, null))
                .isInstanceOf(BadRequestException.class);
    }
}
