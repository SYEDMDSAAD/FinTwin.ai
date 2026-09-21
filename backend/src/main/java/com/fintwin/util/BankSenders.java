package com.fintwin.util;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Which sender domains are banks, and whether a DKIM signature speaks for the
 * address an email claims to be from.
 *
 * An alert is only read when a bank's own mail servers signed it. Anyone who
 * learns a user's forwarding address can send it mail; nobody but the bank can
 * produce a valid signature for the bank's domain.
 */
public final class BankSenders {

    private BankSenders() {}

    /**
     * RBI has reserved .bank.in for regulated banks (registration runs through
     * IDRBT), so any domain under it is a bank. The list below covers the
     * domains banks sent alerts from before that migration.
     */
    private static final String BANK_IN = ".bank.in";

    private static final Map<String, String> LEGACY = new LinkedHashMap<>();
    static {
        LEGACY.put("hdfcbank.net", "HDFC");
        LEGACY.put("hdfcbank.com", "HDFC");
        LEGACY.put("icicibank.com", "ICICI");
        LEGACY.put("sbi.co.in", "SBI");
        LEGACY.put("sbicard.com", "SBI Card");
        LEGACY.put("axisbank.com", "Axis");
        LEGACY.put("kotak.com", "Kotak");
        LEGACY.put("yesbank.in", "Yes Bank");
        LEGACY.put("idfcfirstbank.com", "IDFC FIRST");
        LEGACY.put("indusind.com", "IndusInd");
        LEGACY.put("federalbank.co.in", "Federal");
        LEGACY.put("bankofbaroda.com", "Bank of Baroda");
        LEGACY.put("bankofbaroda.co.in", "Bank of Baroda");
        LEGACY.put("pnb.co.in", "PNB");
        LEGACY.put("canarabank.com", "Canara");
        LEGACY.put("unionbankofindia.co.in", "Union Bank");
        LEGACY.put("aubank.in", "AU");
        LEGACY.put("rblbank.com", "RBL");
    }

    // Short names for .bank.in labels that don't read well capitalised
    private static final Map<String, String> BANK_IN_NAMES = Map.ofEntries(
            Map.entry("hdfc", "HDFC"), Map.entry("hdfcbank", "HDFC"),
            Map.entry("icici", "ICICI"), Map.entry("icicibank", "ICICI"),
            Map.entry("sbi", "SBI"), Map.entry("axis", "Axis"), Map.entry("axisbank", "Axis"),
            Map.entry("kotak", "Kotak"), Map.entry("yes", "Yes Bank"), Map.entry("yesbank", "Yes Bank"),
            Map.entry("idfcfirst", "IDFC FIRST"), Map.entry("idfcfirstbank", "IDFC FIRST"),
            Map.entry("indusind", "IndusInd"), Map.entry("federal", "Federal"),
            Map.entry("federalbank", "Federal"), Map.entry("bankofbaroda", "Bank of Baroda"),
            Map.entry("bob", "Bank of Baroda"), Map.entry("pnb", "PNB"), Map.entry("canara", "Canara"),
            Map.entry("canarabank", "Canara"), Map.entry("unionbank", "Union Bank"),
            Map.entry("au", "AU"), Map.entry("aubank", "AU"), Map.entry("rbl", "RBL"),
            Map.entry("rblbank", "RBL"));

    // Second-level suffixes under which the registrable domain has three labels
    private static final Set<String> TWO_PART_SUFFIXES =
            Set.of("co.in", "bank.in", "net.in", "org.in", "gov.in", "ac.in", "firm.in", "gen.in", "ind.in");

    /** The bank a sender domain belongs to, if it is one. */
    public static Optional<String> bankFor(String domain) {
        if (domain == null || domain.isBlank()) return Optional.empty();
        String d = domain.toLowerCase(Locale.ROOT).trim();
        for (Map.Entry<String, String> e : LEGACY.entrySet()) {
            if (d.equals(e.getKey()) || d.endsWith("." + e.getKey())) return Optional.of(e.getValue());
        }
        if (d.endsWith(BANK_IN)) {
            String registrable = orgDomain(d);
            String label = registrable.substring(0, registrable.length() - BANK_IN.length());
            if (label.isEmpty() || label.contains(".")) return Optional.empty();
            return Optional.of(BANK_IN_NAMES.getOrDefault(label,
                    label.substring(0, 1).toUpperCase(Locale.ROOT) + label.substring(1)));
        }
        return Optional.empty();
    }

    /**
     * The registrable domain: "alerts.hdfcbank.net" → "hdfcbank.net",
     * "alerts.sbi.co.in" → "sbi.co.in", "mail.hdfc.bank.in" → "hdfc.bank.in".
     */
    public static String orgDomain(String domain) {
        String d = domain.toLowerCase(Locale.ROOT).trim();
        String[] labels = d.split("\\.");
        if (labels.length <= 2) return d;
        String lastTwo = labels[labels.length - 2] + "." + labels[labels.length - 1];
        int keep = TWO_PART_SUFFIXES.contains(lastTwo) ? 3 : 2;
        if (labels.length <= keep) return d;
        return String.join(".", java.util.Arrays.copyOfRange(labels, labels.length - keep, labels.length));
    }

    /**
     * DMARC-style relaxed alignment: the signing domain and the From domain
     * belong to the same organisation. A signature by some unrelated domain
     * (a mailing-list relay, Gmail's forwarding signature) says nothing about
     * who wrote the alert.
     */
    public static boolean aligned(String signingDomain, String fromDomain) {
        if (signingDomain == null || fromDomain == null) return false;
        return orgDomain(signingDomain).equals(orgDomain(fromDomain));
    }

    /** Domain part of an email address, lower-cased; null when there is none. */
    public static String domainOf(String address) {
        if (address == null) return null;
        int at = address.lastIndexOf('@');
        if (at < 0 || at == address.length() - 1) return null;
        return address.substring(at + 1).replace(">", "").trim().toLowerCase(Locale.ROOT);
    }
}
