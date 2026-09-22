package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import com.fintwin.model.SupportTicket;
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

    private static SupportTicket ticket(String message) {
        SupportTicket t = new SupportTicket();
        t.setUserEmail("a@example.com");
        t.setMessage(message);
        return t;
    }

    @Test
    void readsBackEveryAnswer() {
        var f = TicketService.parseFeedback(ticket(TicketService.feedbackMessage(4,
                List.of("Dashboard", "AI Copilot"), "More banks\nand UPI apps", "PDF import was slow")));
        assertThat(f.rating()).isEqualTo(4);
        assertThat(f.useful()).containsExactly("Dashboard", "AI Copilot");
        assertThat(f.improve()).isEqualTo("More banks\nand UPI apps");
        assertThat(f.broken()).isEqualTo("PDF import was slow");
    }

    @Test
    void readsBackPartialAnswers() {
        var onlyBroken = TicketService.parseFeedback(ticket(TicketService.feedbackMessage(2, List.of(), null, "Login loop")));
        assertThat(onlyBroken.useful()).isEmpty();
        assertThat(onlyBroken.improve()).isNull();
        assertThat(onlyBroken.broken()).isEqualTo("Login loop");

        var ratingOnly = TicketService.parseFeedback(ticket(TicketService.feedbackMessage(5, null, "", "")));
        assertThat(ratingOnly.rating()).isEqualTo(5);
        assertThat(ratingOnly.improve()).isNull();
        assertThat(ratingOnly.broken()).isNull();
    }

    @Test
    void aHeadingTypedByTheUserStaysInTheirAnswer() {
        String typed = "Ideas\n\nWhat didn't work:\nnothing, just kidding";
        var f = TicketService.parseFeedback(ticket(TicketService.feedbackMessage(3, List.of(), typed, "Charts")));
        assertThat(f.improve()).isEqualTo(typed);
        assertThat(f.broken()).isEqualTo("Charts");
    }
}
