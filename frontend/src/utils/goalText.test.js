import { describe, it, expect } from "vitest";
import { parseGoalText } from "./goalText";

const NOW = new Date(2026, 10, 26);   // 26 Nov 2026

describe("parseGoalText", () => {
    it.each([
        ["Goa trip in March, 40k", { title: "Goa trip", targetAmount: 40000, durationMonths: 4 }],
        ["save 2 lakh for a bike in 18 months", { title: "Bike", targetAmount: 200000, durationMonths: 18 }],
        ["Emergency fund ₹1.5L by Dec 2027", { title: "Emergency fund", targetAmount: 150000, durationMonths: 13 }],
        ["iPhone 85,000 in 6 months", { title: "IPhone", targetAmount: 85000, durationMonths: 6 }],
        ["house down payment 10 lakhs in 3 years", { title: "House down payment", targetAmount: 1000000, durationMonths: 36 }],
        ["wedding Rs 5,00,000 by 2028", { title: "Wedding", targetAmount: 500000, durationMonths: 14 }],
        ["laptop 60k next year", { title: "Laptop", targetAmount: 60000, durationMonths: 12 }],
        ["Car 8 lakh by Jan '28", { title: "Car", targetAmount: 800000, durationMonths: 14 }],
    ])("%s", (text, expected) => {
        expect(parseGoalText(text, NOW)).toEqual(expected);
    });

    it("a month already past this year means next year's", () => {
        expect(parseGoalText("trip in Nov 30k", NOW).durationMonths).toBe(12);
        expect(parseGoalText("trip in Dec 30k", NOW).durationMonths).toBe(1);
    });

    it("leaves out what the sentence doesn't say", () => {
        expect(parseGoalText("new phone", NOW)).toEqual({ title: "New phone", targetAmount: null, durationMonths: null });
        expect(parseGoalText("", NOW)).toEqual({ title: null, targetAmount: null, durationMonths: null });
    });
});
