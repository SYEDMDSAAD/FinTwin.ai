package com.fintwin.util;

/**
 * A category and how it was arrived at. The "how" is stored with every
 * transaction so that, once users correct or confirm categories, we can tell
 * which method gets things wrong — and later train on the corrections.
 */
public record Categorized(String category, String source) {

    // ── Automatic: the prediction a user may later correct ────────────────────
    /** The user's own merchant→category rule, from an earlier correction. */
    public static final String LEARNED = "LEARNED";
    /** A known brand ("Swiggy", "IRCTC"). */
    public static final String BRAND = "BRAND";
    /** A word in a local shop's name ("…bakery", "…medicose"). */
    public static final String SHOP_WORD = "SHOP_WORD";
    /** The payee looks like a person. */
    public static final String PERSON = "PERSON";
    /** Money between the user's own accounts. */
    public static final String SELF_TRANSFER = "SELF_TRANSFER";
    /** Nothing matched — left in "Other". */
    public static final String NONE = "NONE";
    /** Card bookkeeping (bill payments), not a guess about the merchant. */
    public static final String FORCED = "FORCED";
    /** A category column in the imported file. */
    public static final String PROVIDED = "PROVIDED";
    /** The bank-sync keyword list (BankConnectionService). */
    public static final String BANK_KEYWORD = "BANK_KEYWORD";
    /** The local model's suggestion for a payee the rules left in Other, accepted or changed by the user. */
    public static final String LLM = "LLM";

    // ── Not predictions ───────────────────────────────────────────────────────
    /** The user picked the category when adding the transaction. */
    public static final String USER = "USER";
    /** Sample data from onboarding — never a training example. */
    public static final String SEED = "SEED";
    /** Categorised before sources were recorded; the category it had is the prediction. */
    public static final String LEGACY = "LEGACY";

    // ── What the user did with the prediction ─────────────────────────────────
    public static final String CORRECTED = "CORRECTED";
    public static final String CONFIRMED = "CONFIRMED";
    /** Set by "apply to similar": the user chose it, but didn't look at this row. */
    public static final String APPLIED = "APPLIED";

    public static Categorized other() {
        return new Categorized("Other", NONE);
    }
}
