// Categories offered when recategorizing a transaction. Most are produced by
// the backend categorisation pipeline; Groceries and Investments are manual-only
// (no backend rule emits them) and start matching automatically only after the
// user recategorises a merchant into them and a learned rule is created.
// People = money sent to someone else (counted as spending); Transfer = the
// user's own accounts (left out of spending).
export const EDIT_CATEGORIES = [
  "Food","Groceries","Travel","Transport","Shopping","Bills","Utilities",
  "Entertainment","Housing","Rent","Health","Education","EMI",
  "Investments","Income","People","Transfer","Other",
];
