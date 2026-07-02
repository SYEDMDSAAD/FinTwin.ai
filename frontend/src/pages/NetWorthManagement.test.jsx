import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderPage } from "../test/renderPage";
import NetWorthManagement from "./NetWorthManagement";

describe("NetWorthManagement", () => {
  it("renders without crashing", () => {
    const noop = vi.fn();
    renderPage(
      <NetWorthManagement
        netWorth={null}
        assets={[]}
        liabilities={[]}
        createAsset={noop}
        updateAsset={noop}
        deleteAsset={noop}
        createLiability={noop}
        updateLiability={noop}
        deleteLiability={noop}
      />,
      { authed: true }
    );
    expect(screen.getByText("Net Worth")).toBeInTheDocument();
  });
});
