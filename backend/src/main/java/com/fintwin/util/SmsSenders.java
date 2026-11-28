package com.fintwin.util;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Which SMS senders are banks.
 *
 * Commercial SMS in India comes from a TRAI-registered (DLT) header: a
 * two-letter operator/circle prefix, a six-character sender code, and on
 * newer messages a suffix for the message type, e.g. "VM-HDFCBK",
 * "AD-ICICIT-S", "JD-SBIINB-T". Some phones show only the code ("HDFCBK").
 * Only the code identifies the sender, and nobody but the registered
 * entity can send under it, so the code alone decides whether the message
 * is from a bank. Messages from ordinary phone numbers are never read.
 */
public final class SmsSenders {

    private SmsSenders() {}

    // prefix "XY-", the 6-character code, optional "-S/-T/-P/-G" type suffix
    private static final Pattern HEADER = Pattern.compile("^(?:[A-Z]{2}-)?([A-Z0-9]{6})(?:-[A-Z])?$");

    private static final Map<String, String> BANKS = Map.ofEntries(
            Map.entry("HDFCBK", "HDFC"), Map.entry("HDFCBN", "HDFC"),
            Map.entry("ICICIB", "ICICI"), Map.entry("ICICIT", "ICICI"),
            Map.entry("SBIINB", "SBI"), Map.entry("SBIPSG", "SBI"), Map.entry("SBMSMS", "SBI"),
            Map.entry("CBSSBI", "SBI"), Map.entry("ATMSBI", "SBI"), Map.entry("SBIUPI", "SBI"),
            Map.entry("SBICRD", "SBI Card"), Map.entry("SBIPRM", "SBI Card"),
            Map.entry("AXISBK", "Axis"), Map.entry("AXISMR", "Axis"),
            Map.entry("KOTAKB", "Kotak"), Map.entry("KOTAKM", "Kotak"),
            Map.entry("YESBNK", "Yes Bank"),
            Map.entry("IDFCFB", "IDFC FIRST"), Map.entry("IDFCBK", "IDFC FIRST"),
            Map.entry("INDUSB", "IndusInd"), Map.entry("INDUSL", "IndusInd"),
            Map.entry("FEDBNK", "Federal"), Map.entry("FEDFIB", "Federal"),
            Map.entry("BOBTXN", "Bank of Baroda"), Map.entry("BOBSMS", "Bank of Baroda"),
            Map.entry("BOBCRD", "Bank of Baroda"),
            Map.entry("PNBSMS", "PNB"), Map.entry("PNBBNK", "PNB"),
            Map.entry("CANBNK", "Canara"), Map.entry("CNRBNK", "Canara"),
            Map.entry("UNIONB", "Union Bank"), Map.entry("UBOIND", "Union Bank"),
            Map.entry("BOIIND", "Bank of India"), Map.entry("BOISMS", "Bank of India"),
            Map.entry("CENTBK", "Central Bank"), Map.entry("IOBCHN", "Indian Overseas"),
            Map.entry("IOBBNK", "Indian Overseas"), Map.entry("UCOBNK", "UCO"),
            Map.entry("IDBIBK", "IDBI"), Map.entry("INDBNK", "Indian Bank"),
            Map.entry("AUBANK", "AU"), Map.entry("RBLBNK", "RBL"), Map.entry("RBLCRD", "RBL"),
            Map.entry("KVBANK", "Karur Vysya"), Map.entry("SIBSMS", "South Indian"),
            Map.entry("JKBANK", "J&K Bank"), Map.entry("DBSBNK", "DBS"),
            Map.entry("SCBANK", "Standard Chartered"), Map.entry("HSBCIN", "HSBC"),
            Map.entry("CITIBK", "Citi"), Map.entry("PAYTMB", "Paytm Payments Bank"),
            Map.entry("AIRBNK", "Airtel Payments Bank"), Map.entry("IPBMSG", "India Post Payments Bank"),
            Map.entry("EQUTAS", "Equitas"), Map.entry("UJJIVN", "Ujjivan"),
            Map.entry("ONECRD", "OneCard"), Map.entry("SLICEI", "Slice"));

    // How banks sign their messages: "...-SBI", "HDFC Bank", "ICICI Bank."
    private static final List<Map.Entry<Pattern, String>> SIGNATURES = List.of(
            Map.entry(Pattern.compile("(?i)-\\s*SBI\\b|\\bSBI\\s*$|State Bank of India"), "SBI"),
            Map.entry(Pattern.compile("(?i)\\bHDFC\\s*Bank\\b"), "HDFC"),
            Map.entry(Pattern.compile("(?i)\\bICICI\\s*Bank\\b"), "ICICI"),
            Map.entry(Pattern.compile("(?i)\\bAxis\\s*Bank\\b"), "Axis"),
            Map.entry(Pattern.compile("(?i)\\bKotak\\b"), "Kotak"),
            Map.entry(Pattern.compile("(?i)\\bYes\\s*Bank\\b"), "Yes Bank"),
            Map.entry(Pattern.compile("(?i)\\bIDFC\\s*FIRST\\b"), "IDFC FIRST"),
            Map.entry(Pattern.compile("(?i)\\bIndusInd\\b"), "IndusInd"),
            Map.entry(Pattern.compile("(?i)\\bFederal\\s*Bank\\b"), "Federal"),
            Map.entry(Pattern.compile("(?i)\\bBank\\s*of\\s*Baroda\\b|\\bBOB\\b"), "Bank of Baroda"),
            Map.entry(Pattern.compile("(?i)\\bPNB\\b|Punjab National Bank"), "PNB"),
            Map.entry(Pattern.compile("(?i)\\bCanara\\s*Bank\\b"), "Canara"),
            Map.entry(Pattern.compile("(?i)\\bUnion\\s*Bank\\b"), "Union Bank"));

    /**
     * The bank that signed a message, for when the phone didn't pass on who
     * sent it. Only for messages the user chose to forward themselves.
     */
    public static Optional<String> bankFromText(String body) {
        if (body == null) return Optional.empty();
        for (var e : SIGNATURES) {
            if (e.getKey().matcher(body).find()) return Optional.of(e.getValue());
        }
        return Optional.empty();
    }

    /** The bank behind an SMS sender, if it is one. */
    public static Optional<String> bankFor(String sender) {
        String code = code(sender);
        return code == null ? Optional.empty() : Optional.ofNullable(BANKS.get(code));
    }

    /** The six-character DLT sender code, or null for a phone number or anything else. */
    public static String code(String sender) {
        if (sender == null) return null;
        Matcher m = HEADER.matcher(sender.trim().toUpperCase(Locale.ROOT));
        if (!m.matches()) return null;
        String code = m.group(1);
        // A six-digit "code" is a short phone number, not a registered header
        return code.chars().allMatch(Character::isDigit) ? null : code;
    }
}
