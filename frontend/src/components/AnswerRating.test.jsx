import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MockAdapter from "axios-mock-adapter";

import API from "../services/api";
import AnswerRating from "./AnswerRating";

let mock;
beforeEach(() => {
    mock = new MockAdapter(API);
    mock.onPut("/transactions/chat/history/7/rating").reply(200, {});
});
const sent = () => mock.history.put.map(r => JSON.parse(r.data));

describe("AnswerRating", () => {
    it("a thumbs up is saved, and pressing it again takes it back", async () => {
        const user = userEvent.setup();
        render(<AnswerRating exchangeId="7" />);
        const up = screen.getByRole("button", { name: "Helpful" });

        await user.click(up);
        await waitFor(() => expect(up).toHaveAttribute("aria-pressed", "true"));
        await user.click(up);
        await waitFor(() => expect(up).toHaveAttribute("aria-pressed", "false"));
        expect(sent()).toEqual([{ rating: 1 }, { rating: 0 }]);
    });

    it("a thumbs down asks why and sends the reason", async () => {
        const user = userEvent.setup();
        render(<AnswerRating exchangeId="7" />);

        await user.click(screen.getByRole("button", { name: "Not helpful" }));
        await user.click(await screen.findByRole("button", { name: "Wrong numbers" }));

        await waitFor(() => expect(sent()).toEqual([{ rating: -1 }, { rating: -1, reason: "WRONG_NUMBERS" }]));
        expect(screen.queryByRole("group", { name: /what was wrong/i })).not.toBeInTheDocument();
    });

    it("shows a rating given earlier", () => {
        render(<AnswerRating exchangeId="7" initial={-1} />);
        expect(screen.getByRole("button", { name: "Not helpful" })).toHaveAttribute("aria-pressed", "true");
    });

    it("puts the old state back if saving fails", async () => {
        mock.reset();
        mock.onPut("/transactions/chat/history/7/rating").reply(500);
        const user = userEvent.setup();
        render(<AnswerRating exchangeId="7" />);
        const up = screen.getByRole("button", { name: "Helpful" });
        await user.click(up);
        await waitFor(() => expect(up).toHaveAttribute("aria-pressed", "false"));
    });
});
