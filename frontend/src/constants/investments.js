// An IPO application's journey. Allotted shares get a live price once the
// holding has its NSE symbol; a refunded application stops counting.
export const IPO_STATUSES = [
    { value: "APPLIED",      label: "Applied — money blocked" },
    { value: "ALLOTTED",     label: "Allotted — waiting to list" },
    { value: "NOT_ALLOTTED", label: "Not allotted — refunded" },
    { value: "LISTED",       label: "Listed — trading" },
];
