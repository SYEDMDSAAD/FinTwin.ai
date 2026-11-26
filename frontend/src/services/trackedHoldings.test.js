import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./api", () => ({ default: { post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import API from "./api";
import { legacyPayload, moveDeviceDataOnce, _resetMoveForTests, LEGACY_KEYS } from "./trackedHoldings";

const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));

describe("moving device-only data into the account", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    _resetMoveForTests();
  });

  it("has nothing to send on a fresh device", async () => {
    expect(legacyPayload()).toBeNull();
    await moveDeviceDataOnce();
    expect(API.post).not.toHaveBeenCalled();
  });

  it("shapes the old local records for the server", () => {
    put(LEGACY_KEYS.sips, [{ id: "1", fundName: "Midcap", amount: "2000", frequency: "Monthly", nextDebitDate: "2026-12-01", notes: "" }]);
    put(LEGACY_KEYS.usHoldings, [{ id: "2", name: "Apple", ticker: "AAPL", units: 2, buyPrice: 180, currentPrice: 190, buyDate: "" }]);
    put(LEGACY_KEYS.watchlist, [{ schemeCode: 120503, schemeName: "Some Fund" }]);
    put(LEGACY_KEYS.goalSipLinks, { 42: { fundName: "", monthlyAmount: "3000" } });

    expect(legacyPayload()).toEqual({
      sips: [{ fundName: "Midcap", amount: 2000, frequency: "Monthly", nextDebitDate: "2026-12-01", notes: null }],
      usHoldings: [{ name: "Apple", ticker: "AAPL", units: 2, buyPrice: 180, buyDate: null }],
      watchlist: [{ schemeCode: "120503", schemeName: "Some Fund" }],
      goalSipLinks: [{ goalId: 42, fundName: null, monthlyAmount: 3000 }],
    });
  });

  it("sends once, then clears the device copy", async () => {
    put(LEGACY_KEYS.sips, [{ fundName: "Midcap", amount: 2000 }]);
    API.post.mockResolvedValue({ data: {} });

    await Promise.all([moveDeviceDataOnce(), moveDeviceDataOnce()]);

    expect(API.post).toHaveBeenCalledTimes(1);
    expect(API.post).toHaveBeenCalledWith("/device-data/import", expect.any(Object));
    expect(localStorage.getItem(LEGACY_KEYS.sips)).toBeNull();
  });

  it("keeps the device copy when the move fails, and tries again next time", async () => {
    put(LEGACY_KEYS.watchlist, [{ schemeCode: 1, schemeName: "A" }]);
    API.post.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: {} });

    await moveDeviceDataOnce();
    expect(localStorage.getItem(LEGACY_KEYS.watchlist)).not.toBeNull();

    await moveDeviceDataOnce();
    expect(API.post).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(LEGACY_KEYS.watchlist)).toBeNull();
  });

  it("never pushes a device's data into the shared demo account", async () => {
    put("user", { role: "DEMO" });
    put(LEGACY_KEYS.sips, [{ fundName: "Midcap", amount: 2000 }]);
    await moveDeviceDataOnce();
    expect(API.post).not.toHaveBeenCalled();
    expect(localStorage.getItem(LEGACY_KEYS.sips)).not.toBeNull();
  });

  it("survives junk in old storage", () => {
    localStorage.setItem(LEGACY_KEYS.sips, "{not json");
    put(LEGACY_KEYS.goalSipLinks, { abc: { monthlyAmount: "x" } });
    expect(legacyPayload()).toBeNull();
  });
});
