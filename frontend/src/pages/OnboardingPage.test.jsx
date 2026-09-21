import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent, render } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import OnboardingPage, { StatementProgress } from "./OnboardingPage";

// Two months of a real-looking statement: Aug and Sep 2026
const STATEMENT = [
  "Account Number :,XXXXXXX1234",
  "Txn Date,Description,Debit,Credit,Balance",
  '05/08/2026,UPI/SWIGGY,"1,250.00",,"24,550.00"',
  '02/09/2026,NEFT CR ACME PAYROLL,,"1,20,000.00","1,44,550.00"',
].join("\r\n");

function openStepTwo() {
  sessionStorage.setItem("ob-step", "1");
  return renderPage(<OnboardingPage />, { route: "/onboarding", authed: true });
}

describe("OnboardingPage", () => {
  beforeEach(() => sessionStorage.clear());

  it("renders the first step without crashing", () => {
    renderPage(<OnboardingPage />, { route: "/onboarding", authed: true });
    expect(screen.getByText("Secure your financial twin")).toBeInTheDocument();
  });
});

describe("OnboardingPage — step 2, adding transactions", () => {
  beforeEach(() => sessionStorage.clear());

  it("offers statements as the recommended option and the sandbox as a demo", () => {
    openStepTwo();

    expect(screen.getByText("Upload your bank statements")).toBeInTheDocument();
    expect(screen.getByText("RECOMMENDED")).toBeInTheDocument();
    expect(screen.getByText("Try the Setu bank-link sandbox")).toBeInTheDocument();
    expect(screen.getByText("DEMO ONLY")).toBeInTheDocument();
    expect(screen.getByText(/demo sandbox — not real transactions/)).toBeInTheDocument();
    expect(screen.getByText(/use option 1/)).toBeInTheDocument();
  });

  it("asks for the sandbox mobile number only once the user chooses the sandbox", () => {
    openStepTwo();

    expect(screen.queryByLabelText(/MOBILE NUMBER/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Use the sandbox"));
    expect(screen.getByLabelText(/MOBILE NUMBER/)).toBeInTheDocument();
    expect(screen.getByText("Connect sandbox →")).toBeInTheDocument();
  });

  it("opens the statement importer and holds Continue until something is imported", () => {
    openStepTwo();
    fireEvent.click(screen.getByText("Upload statements"));

    expect(screen.getByText("Upload your bank statements")).toBeInTheDocument();
    expect(screen.getByText("STEP 1 — UPLOAD STATEMENT")).toBeInTheDocument();
    expect(screen.getByText(/Upload a statement to continue/).closest("button")).toBeDisabled();
  });

  it("counts the months imported and lets the user continue", async () => {
    const { container } = openStepTwo();
    fireEvent.click(screen.getByText("Upload statements"));

    fireEvent.change(container.querySelector("#csv-upload"), {
      target: { files: [new File([STATEMENT], "HDFC_Sept.csv", { type: "text/csv" })] },
    });
    fireEvent.click(await screen.findByText(/Preview →/));
    fireEvent.click(await screen.findByText("Import 2 Transactions"));

    expect(await screen.findByText(/2 months in — good to go/)).toBeInTheDocument();
    expect(screen.getByText("Continue to Profile").closest("button")).toBeEnabled();
    // statements are real data: onboarding must not take the AI-generated path
    expect(sessionStorage.getItem("ob-manual")).toBe("0");
  });

  it("hides the manual skip once statements are in, so they can't be replaced by generated data", async () => {
    sessionStorage.setItem("ob-stmt-months", JSON.stringify(["2026-08"]));
    openStepTwo();

    expect(screen.queryByText(/Skip — I'll add manually/)).not.toBeInTheDocument();
  });
});

describe("StatementProgress", () => {
  it.each([
    [[], /Nothing imported yet/],
    [["2026-09"], /1 month in\. Add 1–2 more/],
    [["2026-08", "2026-09"], /2 months in — good to go/],
    [["2026-07", "2026-08", "2026-09"], /3 months in — great/],
  ])("describes %j", (months, text) => {
    render(<StatementProgress months={months} />);
    expect(screen.getByRole("status")).toHaveTextContent(text);
  });
});
