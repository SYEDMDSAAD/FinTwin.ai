import { describe, it, expect } from "vitest";
import { salaryNeedsPlan } from "./PaydayPanel";

const NOW = new Date("2026-12-03T10:00:00");
const salary = { lastPaid: "2026-12-01", lastAmount: 52000 };

describe("salaryNeedsPlan", () => {
    it("a salary that just landed with no plan yet", () => {
        expect(salaryNeedsPlan(salary, null, NOW)).toBe(true);
    });
    it("a plan approved before it landed is last month's", () => {
        expect(salaryNeedsPlan(salary, { approved_at: "2026-11-02T09:00:00+05:30" }, NOW)).toBe(true);
    });
    it("not once this salary has a plan", () => {
        expect(salaryNeedsPlan(salary, { approved_at: "2026-12-01T12:00:00+05:30" }, NOW)).toBe(false);
    });
    it("not for an old salary", () => {
        expect(salaryNeedsPlan({ ...salary, lastPaid: "2026-11-01" }, null, NOW)).toBe(false);
    });
});
