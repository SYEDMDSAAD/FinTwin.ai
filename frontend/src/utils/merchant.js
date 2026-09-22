/**
 * The same rule the backend uses (CategoryService.normalizeMerchant) to decide
 * whether two rows are payments to the same payee: lowercase, trimmed,
 * runs of whitespace collapsed. Used wherever the page has to mirror an
 * "apply to similar" update without refetching.
 */
export const normalizeMerchant = (merchant) =>
    String(merchant || "").toLowerCase().trim().replace(/\s+/g, " ");
