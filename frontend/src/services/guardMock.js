/* An in-browser stand-in for guard-service, for building the screens without a
   backend. The requests and responses have the same shapes; the decisions are
   simple fixed rules, labelled source "mock", never AI. All data is made up. */

const BUDGETS = {
    Food: [6000, 5750], Groceries: [8000, 4200], Shopping: [4000, 3100], Entertainment: [2000, 1500],
    Transport: [3000, 1800], Health: [2000, 300], Bills: [4500, 4500], Rent: [10000, 10000],
};
const GOALS = [{ title: "Goa trip", monthly: 6000 }, { title: "Emergency fund", monthly: 1000 }];
const MCC = {
    5812: "Food", 5813: "Food", 5814: "Food", 5411: "Groceries", 5499: "Groceries", 5912: "Health",
    4121: "Transport", 5541: "Transport", 7832: "Entertainment", 7995: "Entertainment",
    5651: "Shopping", 5691: "Shopping", 5732: "Shopping", 5999: "Shopping",
};
const ESSENTIAL = new Set(["Groceries", "Health", "Bills", "Rent", "Transport", "Education"]);
const WAITABLE = new Set(["Shopping", "Entertainment", "Travel", "Other"]);
const VPA = /^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/;

const inr = (n) => (n < 0 ? "-" : "") + "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
const newId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

function fail(message) {
    const e = new Error(message);
    e.response = { status: 400, data: { error: message } };
    return e;
}

function fresh() {
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const next = new Date(monday);
    next.setDate(next.getDate() + 7);
    return {
        balances: { main: 30000, spending: 5000 }, buffer: 3500, weekly: 5000,
        weekStart: day(monday), nextAllowance: day(next), nextCut: 0, saved: 0, adjustments: {}, plan: null,
        settings: { language: "English", minCheck: 100, maxPausesPerDay: 3, emergencyPerMonth: 2,
                    emergencyMax: 1500, ownUpiId: "", ownName: "" },
        events: [], wishlist: [], plans: {},
    };
}

let s = fresh();

function daysToAllowance() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((new Date(s.nextAllowance + "T00:00:00") - today) / 864e5));
}

function over(e) {
    const b = e.facts?.budget;
    return b && b.over_after ? Math.min(e.amount, -b.left_after) : 0;
}

function toRebalance(e) {
    if (e.choice !== "paid" || e.rebalanced) return 0;
    return e.type === "scan" ? over(e) : e.moved || 0;
}

function brief(e) {
    return {
        id: e.id, type: e.type, at: e.at, amount: e.moved || e.amount, category: e.category,
        payeeName: e.payeeName || e.note || "", decision: e.decision, message: e.message, source: e.source,
        choice: e.choice, worthIt: e.worthIt, toRebalance: toRebalance(e), proposedCuts: e.proposedCuts || null,
    };
}

function mask(upi) {
    if (!upi || !upi.includes("@")) return "";
    const [name, handle] = upi.split("@");
    return (name.length > 2 ? name.slice(0, 2) : "") + "***@" + handle;
}

function view() {
    return {
        demo: true, mock: true,
        balances: { ...s.balances }, buffer: s.buffer,
        weekly: s.plan ? s.plan.weekly[s.plan.week] : s.weekly,
        weekStart: s.weekStart, nextAllowance: s.nextAllowance, daysToAllowance: daysToAllowance(),
        nextAllowanceCut: s.nextCut, savedByPausing: s.saved, adjustments: { ...s.adjustments }, plan: s.plan,
        settings: { ...s.settings, ownUpiId: mask(s.settings.ownUpiId) },
        wishlist: s.wishlist.map((w) => ({
            id: w.id, name: w.name, amount: w.amount, category: w.category, addedAt: w.addedAt, readyAt: w.readyAt,
            ready: Date.now() >= new Date(w.readyAt).getTime(), canBuy: Boolean(w.qr),
        })),
        recent: s.events.slice(0, 12).map(brief),
        checkIns: s.events
            .filter((e) => e.choice === "paid" && e.worthIt == null && (e.decision === "pause" || e.type === "topup"))
            .slice(0, 3).map(brief),
        ai: "mock", data: "persona",
    };
}

function parseQr(raw) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!/^upi:\/\/pay\?/i.test(text)) throw fail("That isn't a UPI payment QR code.");
    const p = new URLSearchParams(text.slice(text.indexOf("?") + 1));
    const pa = (p.get("pa") || "").trim();
    if (!VPA.test(pa)) throw fail("This QR code has no valid UPI ID to pay.");
    const mc = /^\d{4}$/.test(p.get("mc") || "") ? p.get("mc") : "";
    return { raw: text, pa, pn: (p.get("pn") || "").slice(0, 99), mc, am: p.get("am") ? Number(p.get("am")) : null };
}

function find(eventId) {
    const e = s.events.find((x) => x.id === eventId);
    if (!e) throw fail("That item wasn't found.");
    return e;
}

const ACTIONS = {
    hello: () => ({ ai: "mock", where: "browser", model: "none", store: "mock", data: "persona", greeting: null }),

    wallet: () => view(),

    check({ qr, amount }) {
        const q = parseQr(qr);
        const exact = q.am ?? Number(amount);
        if (!(exact > 0)) throw fail("Enter an amount above ₹0.");
        const rupees = Math.round(exact);
        const category = MCC[q.mc] || "Other";
        const [limit0, spent] = BUDGETS[category] || [0, 0];
        const limit = limit0 + (s.adjustments[category] || 0);
        const budget = limit0 ? {
            limit, spent, left_after: limit - spent - rupees, over_after: limit - spent - rupees < 0,
            used_after_pct: Math.round(((spent + rupees) * 100) / limit),
        } : null;
        const left = s.balances.spending;
        const week = { left, left_after: left - rupees, days_to_allowance: daysToAllowance(),
                       share_of_left_pct: left > 0 ? Math.round((rupees * 100) / left) : 100 };
        const goal = { name: GOALS[0].title, delay_days: Math.max(1, Math.ceil(rupees / 200)) };
        let decision = "go", message = "", source = "mock", showWishlist = false, reason = null;
        if (week.left_after < 0) {
            decision = "insufficient";
            source = "rules";
            message = `Your spending account has ${inr(left)}, so your bank would decline this ${inr(rupees)} payment. Ask for a top-up if you need it.`;
        } else if (ESSENTIAL.has(category) || rupees < s.settings.minCheck) {
            source = "fast_lane";
            reason = ESSENTIAL.has(category) ? "essential" : "small";
        } else if (budget?.over_after || week.share_of_left_pct >= 40) {
            decision = "pause";
            showWishlist = WAITABLE.has(category);
            message = budget?.over_after
                ? `This takes your ${category} budget ${inr(-budget.left_after)} over. It would push ${goal.name} back about ${goal.delay_days} days.`
                : `${inr(rupees)} is ${week.share_of_left_pct}% of what's left this week.`;
        }
        const e = {
            id: newId(), type: "scan", at: new Date().toISOString(), amount: rupees, exact: exact.toFixed(2),
            category, payeeName: q.pn, qr: q.raw, decision, message, showWishlist, source,
            facts: { budget, week, goal }, choice: null, worthIt: null,
        };
        s.events.unshift(e);
        return {
            eventId: e.id, decision, message, showWishlist, source, reason, amount: e.exact, rupees, category,
            payeeName: q.pn, payeeUpi: q.pa, budget, week, goal,
        };
    },

    outcome({ eventId, choice, amount }) {
        const e = find(eventId);
        if (e.choice) throw fail("You've already decided on this one.");
        const out = { choice, link: null, toRebalance: 0, needsUpiId: false };
        if (e.type === "scan") {
            if (choice === "paid") {
                if (e.decision === "insufficient" || e.amount > s.balances.spending) {
                    throw fail("Your spending account doesn't have enough for this. Ask for a top-up first.");
                }
                s.balances.spending -= e.amount;
                e.paidAt = new Date().toISOString();
                out.link = /[?&]am=\d/i.test(e.qr) ? e.qr : `${e.qr}&am=${e.exact}${/[?&]cu=/i.test(e.qr) ? "" : "&cu=INR"}`;
                out.toRebalance = over(e);
            } else if (choice === "skipped" && e.decision === "pause") {
                s.saved += e.amount;
            } else if (choice === "wishlist") {
                if (!WAITABLE.has(e.category)) throw fail("Only things that can wait go on the wishlist.");
                s.wishlist.push({ id: newId(), name: e.payeeName || e.category, amount: e.amount, category: e.category,
                                  qr: e.qr, exact: e.exact, addedAt: new Date().toISOString(),
                                  readyAt: new Date(Date.now() + 48 * 3600e3).toISOString() });
            }
        } else if (choice === "paid") {
            const offered = [e.amount, e.suggested].filter(Boolean);
            const moved = amount || (e.decision === "approve_less" && e.suggested ? e.suggested : e.amount);
            if (!offered.includes(moved)) throw fail("Choose one of the amounts shown.");
            if (moved > s.buffer) throw fail(`${inr(s.buffer)} is the most you can move without touching bill money.`);
            s.balances.main -= moved;
            s.balances.spending += moved;
            s.buffer -= moved;
            e.moved = moved;
            e.paidAt = new Date().toISOString();
            out.needsUpiId = !s.settings.ownUpiId;
            out.link = s.settings.ownUpiId
                ? `upi://pay?pa=${s.settings.ownUpiId}&pn=${encodeURIComponent(s.settings.ownName || "Me")}&am=${moved}.00&cu=INR&tn=FinTwin%20top-up`
                : null;
            out.toRebalance = moved;
        } else if (choice === "wishlist") {
            s.wishlist.push({ id: newId(), name: e.note || "Top-up", amount: e.amount, category: "Other", qr: null,
                              exact: null, addedAt: new Date().toISOString(),
                              readyAt: new Date(Date.now() + 48 * 3600e3).toISOString() });
        }
        e.choice = choice;
        return { ...out, wallet: view() };
    },

    topup({ amount, reason = "", emergency = false }) {
        const requested = Math.round(Number(amount));
        if (!(requested > 0)) throw fail("Something in that request wasn't right.");
        let decision, suggested = null, message, source = "mock";
        if (emergency) {
            if (requested > s.settings.emergencyMax) throw fail(`Emergency top-ups go up to ${inr(s.settings.emergencyMax)}. You can still ask for a normal top-up.`);
            if (requested > s.buffer) throw fail(`${inr(s.buffer)} is the most you can move without touching bill money.`);
            decision = "emergency";
            source = "rules";
            message = `Emergency top-up: ${inr(requested)} moves now, no questions asked.`;
        } else if (requested > s.buffer) {
            decision = "approve_less";
            suggested = s.buffer;
            message = `${inr(s.buffer)} is the most you can move without touching bill money.`;
        } else if (requested > 1500) {
            decision = "approve_less";
            suggested = 1200;
            message = `${inr(1200)} covers ${daysToAllowance()} days until your allowance, and keeps ${inr(s.buffer - 1200)} in your buffer.`;
        } else {
            decision = "approve";
            message = `${inr(requested)} moves to your spending account, and your buffer keeps ${inr(s.buffer - requested)}.`;
        }
        const e = { id: newId(), type: "topup", at: new Date().toISOString(), amount: requested,
                    note: String(reason).slice(0, 60), category: null, decision, suggested, message, source,
                    choice: null, worthIt: null };
        s.events.unshift(e);
        return { eventId: e.id, decision, message, suggestedAmount: suggested, requested, buffer: s.buffer, source };
    },

    rebalance({ eventId }) {
        const e = find(eventId);
        const amount = toRebalance(e);
        if (amount <= 0) throw fail("This stayed inside your plan, so nothing needs to move.");
        const pool = ["Shopping", "Entertainment", "Food"]
            .filter((c) => c !== e.category)
            .map((c) => ({ name: c, room: Math.max(0, BUDGETS[c][0] + (s.adjustments[c] || 0) - BUDGETS[c][1]) }))
            .filter((c) => c.room > 0);
        let left = amount;
        const cuts = [];
        for (const c of pool) {
            const take = Math.min(left, c.room);
            if (take > 0) cuts.push({ kind: "category", name: c.name, amount: take });
            left -= take;
        }
        const fromNext = Math.min(left, Math.max(0, (s.plan ? s.plan.weekly[s.plan.week] : s.weekly) - s.nextCut));
        if (fromNext > 0) cuts.push({ kind: "next_allowance", name: "Next week's allowance", amount: fromNext });
        left -= fromNext;
        if (left > 0) cuts.push({ kind: "goal", name: "Goa trip", amount: left });
        e.proposedCuts = cuts;
        const parts = cuts.map((c) => `${inr(c.amount)} from ${c.kind === "next_allowance" ? "next week's allowance" : c.name}`);
        const message = `To keep this month on track: ${parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts.at(-1) : parts[0]}.`;
        return { eventId, amount, cuts, message, source: "mock" };
    },

    "approve-cuts"({ eventId }) {
        const e = find(eventId);
        if (!e.proposedCuts) throw fail("There's nothing to approve yet.");
        if (e.rebalanced) throw fail("This one's already been balanced.");
        const total = e.proposedCuts.reduce((t, c) => t + c.amount, 0);
        if (e.type === "scan") s.adjustments[e.category] = (s.adjustments[e.category] || 0) + total;
        for (const c of e.proposedCuts) {
            if (c.kind === "category") s.adjustments[c.name] = (s.adjustments[c.name] || 0) - c.amount;
            if (c.kind === "goal") s.adjustments["goal:" + c.name] = (s.adjustments["goal:" + c.name] || 0) - c.amount;
            if (c.kind === "next_allowance") {
                // That money stays in the main account next week, so it refills the buffer now
                s.nextCut += c.amount;
                s.buffer += c.amount;
            }
        }
        e.rebalanced = true;
        return { wallet: view() };
    },

    payday({ salary }) {
        const pay = Math.round(Number(salary));
        const bills = BUDGETS.Rent[0] + BUDGETS.Bills[0];
        if (!(pay > 0)) throw fail("Something in that request wasn't right.");
        if (pay < bills) throw fail(`That's less than the ${inr(bills)} of rent and bills in your budgets.`);
        const rest = pay - bills;
        const floor = Math.round((BUDGETS.Groceries[0] + BUDGETS.Transport[0] + BUDGETS.Health[0]) / 4.33);
        const buffer = Math.round(rest * 0.08);
        const goalPot = Math.max(0, Math.min(7000, Math.round(rest * 0.3), rest - buffer - 4 * floor));
        const goals = [{ goal: GOALS[0].title, amount: Math.round((goalPot * 6) / 7) }];
        goals.push({ goal: GOALS[1].title, amount: goalPot - goals[0].amount });
        const left = rest - buffer - goalPot;
        const week = Math.floor(left / 4);
        const plan = {
            id: newId(), salary: pay, bills, goals, buffer, weekly: [week, week, week, left - 3 * week],
            message: `Bills of ${inr(bills)} come out first. ${inr(goalPot)} goes to your goals, ${inr(buffer)} stays as a buffer, and about ${inr(week)} a week is yours to spend.`,
            source: "mock", reason: null, created_at: new Date().toISOString(),
        };
        s.plans[plan.id] = plan;
        return { planId: plan.id, plan };
    },

    "approve-plan"({ planId }) {
        const p = s.plans[planId];
        if (!p) throw fail("That plan wasn't found.");
        if (s.plan) throw fail("You approved a plan this week already. Reset the demo to try another.");
        s.balances.main = p.bills + p.buffer + p.weekly.slice(1).reduce((a, b) => a + b, 0);
        s.balances.spending += p.weekly[0];
        s.buffer = p.buffer;
        s.weekly = p.weekly[0];
        s.nextCut = 0;
        s.plan = { id: p.id, salary: p.salary, bills: p.bills, goals: p.goals, buffer: p.buffer,
                   weekly: p.weekly, week: 0, source: p.source, approved_at: new Date().toISOString() };
        return { wallet: view() };
    },

    regret({ eventId, worthIt }) {
        const e = find(eventId);
        if (e.choice !== "paid") throw fail("Only payments you made can be rated.");
        if (e.worthIt != null) throw fail("You've already answered this one.");
        e.worthIt = worthIt;
        return { ok: true };
    },

    "wishlist-remove"({ wishId, outcome = "dropped" }) {
        const item = s.wishlist.find((w) => w.id === wishId);
        if (!item) throw fail("That item wasn't found.");
        s.wishlist = s.wishlist.filter((w) => w.id !== wishId);
        if (outcome === "dropped") s.saved += item.amount;
        return { wallet: view(), buy: outcome === "bought" && item.qr ? { qr: item.qr, amount: item.exact } : null };
    },

    settings(body) {
        if (body.language) s.settings.language = body.language;
        if (body.minCheck != null) s.settings.minCheck = body.minCheck;
        if (body.ownUpiId != null) {
            const upi = String(body.ownUpiId).trim();
            if (upi && !VPA.test(upi)) throw fail("That doesn't look like a UPI ID (name@bank).");
            s.settings.ownUpiId = upi;
        }
        if (body.ownName != null) s.settings.ownName = String(body.ownName).slice(0, 40);
        return view();
    },

    "demo-reset"() {
        s = fresh();
        return view();
    },
};

export async function mockGuard(action, body) {
    const run = ACTIONS[action];
    if (!run) throw fail("Spend Guard couldn't do that.");
    // Long enough to see the loading states; a real check takes a few seconds
    await sleep(action === "payday" ? 900 : 450);
    return run(body || {});
}

/** For tests: start the made-up month again. */
export function resetMock() {
    s = fresh();
}
