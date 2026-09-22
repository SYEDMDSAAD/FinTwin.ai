package com.fintwin.util;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Puts a payee into a category from its name alone.
 *
 * Indian statements name payees three ways, and each needs its own rule:
 *  - brands ("MAKEMYTRIP INDIA PAYU", "Blinkit", "APPLE MEDIA SERVICES");
 *  - local shops, whose name usually says what they sell ("AQsa bakery
 *    show room", "Amit medicose", "SYED PETROL PUMP");
 *  - people — UPI makes paying a person as common as paying a shop
 *    ("SAYYAD ANWAR ASHFAQUE REHMAN", "******7892", "9561926162ptyes").
 *
 * Matching is on whole words, so "ola" no longer fires inside "Kolar" or
 * "Nicolas". People get their own category, not "Transfer": Transfer means
 * the user's own accounts and is excluded from spending, while money sent to
 * someone else is spent.
 */
public final class MerchantCategorizer {

    private MerchantCategorizer() {}

    public static final String PEOPLE = "People";

    // Phrase → category. Checked before shop words, so "HOTEL" in "Taj Hotels"
    // stays Travel while a local "Hotel Garib Nawaz" is a place to eat.
    private static final Map<String, String> BRANDS = new LinkedHashMap<>();
    static {
        brand("Food", "swiggy", "zomato", "dominos", "domino's", "mcdonald", "mcdonalds", "kfc",
                "burger king", "pizza hut", "subway", "starbucks", "haldiram", "haldirams",
                "barbeque nation", "faasos", "behrouz", "eatsure", "box8", "chaayos", "monginis",
                "wow momo", "biryani by kilo", "dunkin", "baskin robbins", "naturals ice cream");
        brand("Groceries", "blinkit", "zepto", "bigbasket", "big basket", "grofers", "dmart", "d mart",
                "avenue supermarts", "jiomart", "jio mart", "reliance fresh", "reliance smart",
                "more retail", "spencers", "star bazaar", "instamart", "milkbasket", "country delight",
                "licious", "freshtohome", "nature's basket");
        brand("Shopping", "amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "tata cliq",
                "croma", "reliance digital", "vijay sales", "decathlon", "ikea", "lenskart",
                "firstcry", "snapdeal", "shoppers stop", "lifestyle", "westside", "pantaloons",
                "max fashion", "max retail", "trends", "zudio", "h&m", "uniqlo", "boat");
        brand("Travel", "makemytrip", "make my trip", "goibibo", "cleartrip", "yatra", "ixigo",
                "easemytrip", "redbus", "abhibus", "irctc", "indian railways", "indigo", "interglobe",
                "air india", "akasa", "spicejet", "vistara", "oyo", "airbnb", "booking.com", "agoda",
                "taj hotels", "treebo", "fabhotels", "msrtc", "tsrtc", "ksrtc", "apsrtc", "gsrtc",
                "upsrtc", "rsrtc", "hrtc");
        brand("Transport", "uber", "ola", "olacabs", "ani technologies", "rapido", "roppen",
                "blu smart", "blusmart", "namma yatri", "yulu", "bounce", "metro", "dmrc", "bmrcl",
                "mmrcl", "hmrl", "fastag", "indian oil", "iocl", "bharat petroleum", "bpcl",
                "hindustan petroleum", "hpcl", "shell", "nayara", "jio-bp");
        brand("Entertainment", "netflix", "spotify", "hotstar", "disney", "jiocinema", "jio cinema",
                "sonyliv", "zee5", "prime video", "youtube", "jiohotstar", "apple media", "apple services",
                "apple.com", "itunes", "google play", "bookmyshow", "book my show", "pvr", "inox",
                "cinepolis", "steam", "playstation", "xbox", "dream11", "gaana", "wynk", "audible");
        brand("Bills", "airtel", "jio", "reliance jio", "vodafone", "vi prepaid", "bsnl", "act fibernet",
                "hathway", "tata play", "tata sky", "dish tv", "d2h", "bescom", "msedcl", "mahadiscom",
                "tneb", "tsspdcl", "apspdcl", "bses", "tata power", "adani electricity", "torrent power",
                "mahanagar gas", "indane", "hp gas", "bharat gas", "passport seva", "mobile recharge",
                "recharge", "electricity", "broadband", "postpaid", "prepaid", "dth", "water bill",
                "gas bill", "municipal", "property tax", "income tax", "gst");
        brand("Health", "apollo", "pharmeasy", "netmeds", "1mg", "tata 1mg", "medplus", "practo",
                "cult.fit", "cultfit", "healthkart", "thyrocare", "dr lal", "metropolis");
        brand("Education", "tcs ion", "byju", "byjus", "unacademy", "udemy", "coursera", "vedantu",
                "physics wallah", "upgrad", "simplilearn", "university", "unipune", "college",
                "school", "academy", "institute");
        brand("EMI", "bajaj finserv", "bajaj finance", "home credit", "loan", "emi");
        brand("Investments", "zerodha", "groww", "upstox", "angel one", "kuvera", "coin by zerodha",
                "paytm money", "smallcase", "mutual fund", "sip", "nps", "ppf");
        brand("Rent", "nobroker", "no broker", "rent");
        brand("Income", "salary", "sal credit", "payroll", "stipend", "bonus", "freelance", "dividend",
                "interest credit");
    }

    // What a local shop's own name says it sells
    private static final Map<String, String> SHOP_WORDS = new LinkedHashMap<>();
    static {
        shop("Food", "bakery", "bakers", "baker", "cake", "cakes", "restaurant", "restro", "resto",
                "hotel", "cafe", "café", "canteen", "mess", "dhaba", "bhojnalaya", "bhojanalaya",
                "mandi", "biryani", "darbar", "bistro", "kitchen", "foods", "food", "sweets", "sweet",
                "mithai", "juice", "tea", "chai", "coffee", "pizza", "burger", "momos", "tiffin",
                "idli", "dosa", "chicken", "mutton", "shawarma", "bites", "caterers", "ice cream",
                "icecream", "bhel", "chaat", "paan", "pan shop", "bar", "vadapav", "vada pav", "pani puri",
                "panipuri", "pav bhaji", "samosa", "misal", "poha", "thali", "halwai", "kulfi", "mava",
                "chaay", "chay", "chaha", "bhaji", "bhajiya", "vadapav", "stall", "stal", "stol", "ice",
                "lassi", "falooda", "snacks", "farsan", "namkeen", "bhojan");
        shop("Groceries", "super market", "supermarket", "hypermarket", "kirana", "general store",
                "general stores", "provision", "provisions", "grocery", "groceries", "fruit", "fruits",
                "vegetable", "vegetables", "sabzi", "dairy", "milk", "eggs", "mart", "bazaar",
                "trading co", "fresh", "kirana store", "provision store");
        shop("Health", "medical", "medicals", "medicose", "medicos", "pharmacy", "pharma", "chemist",
                "chemists", "druggist", "hospital", "clinic", "diagnostic", "diagnostics", "pathology",
                "lab", "labs", "dental", "dentist", "optical", "opticals", "nursing home", "ayurvedic",
                "madical", "medikal", "medicine", "medicines", "medico", "homeopathy");
        shop("Transport", "petrol", "petrol pump", "fuel", "fuels", "filling station", "service station",
                "auto care", "garage", "motors", "tyre", "tyres", "parking", "toll", "car wash",
                "auto", "cab", "cabs", "taxi", "petroleum", "petroleums", "parts", "spares", "cycle",
                "cycal", "bike", "bikes", "automobile", "automobiles");
        shop("Travel", "travels", "tours", "holidays", "bus", "lodge", "resort", "resorts",
                "guest house", "hostel", "airlines", "airways", "railway", "railways");
        shop("Shopping", "salon", "saloon", "parlour", "parlor", "spa", "barber", "hair",
                "flower", "flowers", "florist", "garments", "fashion", "fashions", "clothing",
                "textiles", "boutique", "footwear", "shoes", "mobile", "mobiles", "electronics",
                "jewellers", "jewellery", "gift", "gifts", "printing", "printers", "xerox",
                "photocopy", "stationery", "stationers", "books", "book", "optics", "watch",
                "hardware", "sports", "furniture", "photo", "photos", "studio");
        shop("Entertainment", "cinema", "cinemas", "theatre", "theater", "show city", "multiplex",
                "gaming", "games", "club");
        shop("Education", "classes", "tuition", "coaching", "library");
        shop("Bills", "electric", "internet", "wifi", "broadband", "cable", "commissioner",
                "municipal", "corporation", "nagar nigam", "panchayat", "hmda", "ghmc", "bbmp", "pmc",
                "mcgm", "collectorate", "rto");
        shop("Rent", "pg", "paying guest", "rent", "rental", "house rent");
    }

    // Words that mark a business (so a name without a known category is still
    // not a person): "SARA ENTERPRISES", "OTT COMMERCE SOLUTIONS PVT LTD"
    private static final Set<String> BUSINESS_WORDS = Set.of(
            "enterprises", "enterprise", "traders", "trading", "store", "stores", "shop", "shoppe",
            "services", "service", "solutions", "pvt", "private", "ltd", "limited", "llp", "inc",
            "co", "company", "corp", "corporation", "centre", "center", "agency", "agencies",
            "industries", "industry", "emporium", "studio", "works", "technologies", "tech",
            "india", "international", "global", "systems", "ventures", "associates", "group",
            "collection", "collections", "house", "point", "world", "hub", "zone", "digital",
            "online", "commerce", "retail", "payu", "razorpay", "cashfree", "billdesk", "ccavenue",
            "merchant", "infra", "logistics", "express", "station", "sotre", "wala", "wale", "vala",
            "vale", "walla", "bhandar", "kendra", "sons", "brothers", "bros");

    // Honorifics and fillers in personal names
    private static final Set<String> NAME_PARTICLES = Set.of(
            "mr", "mrs", "ms", "miss", "dr", "md", "mohd", "shri", "smt", "sri", "kumari", "bin", "bint");

    private static final Pattern MASKED_CONTACT = Pattern.compile("[x*•]{3,}\\s*\\d{3,}", Pattern.CASE_INSENSITIVE);
    // A UPI id built on a phone number: "9561926162@ybl", "8459663214ptyes",
    // and the longer digit runs some apps show ("9561926162567ptyes")
    private static final Pattern PHONE_VPA = Pattern.compile("^[6-9]\\d{9,}[a-z@._-]*$", Pattern.CASE_INSENSITIVE);
    private static final Pattern PREFIX = Pattern.compile(
            "^(paid to|paid -|paid|sent to|payment to|transfer to|received from|money received from|"
            + "upi/(?:dr|cr)/\\d+/|upi-|upi/|pos\\s*\\d*\\s*|ach d-|neft (?:cr|dr)-?)\\s*",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NON_WORD = Pattern.compile("[^a-z0-9&'.@]+");

    private static void brand(String category, String... phrases) {
        for (String p : phrases) BRANDS.put(p, category);
    }

    private static void shop(String category, String... words) {
        for (String w : words) SHOP_WORDS.put(w, category);
    }

    /**
     * Category for a payee, or empty when the name gives nothing away — a
     * business name with no telling word, which only the user (or a learned
     * rule) can place.
     */
    public static Optional<String> categorize(String merchant) {
        if (merchant == null || merchant.isBlank()) return Optional.empty();
        String payee = payeeOf(merchant);
        String lower = payee.toLowerCase(Locale.ROOT);
        // "Bikaner &Sweet": a glued "&" hides the word after it
        String spaced = lower.matches(".*\\bh&m\\b.*") ? lower : lower.replace("&", " & ");
        String words = " " + NON_WORD.matcher(spaced).replaceAll(" ").trim() + " ";

        Optional<String> known = firstPhrase(words, BRANDS);
        if (known.isPresent()) return known;
        known = firstPhrase(words, SHOP_WORDS);
        if (known.isPresent()) return known;

        if (looksLikePerson(payee, merchant)) return Optional.of(PEOPLE);
        return Optional.empty();
    }

    /** "Paid to AQsa bakery show room" → "AQsa bakery show room". */
    public static String payeeOf(String merchant) {
        String m = merchant.trim();
        String before;
        do {
            before = m;
            m = PREFIX.matcher(m).replaceFirst("").trim();
        } while (!m.equals(before));
        return m;
    }

    private static Optional<String> firstPhrase(String words, Map<String, String> phrases) {
        for (Map.Entry<String, String> e : phrases.entrySet()) {
            if (words.contains(" " + e.getKey() + " ")) return Optional.of(e.getValue());
        }
        return Optional.empty();
    }

    /**
     * A payee that is almost certainly a person: a contact masked by the UPI
     * app, a phone-number UPI id, or a name of 2–5 plain words with nothing
     * business-like in it. One-word names stay unknown: "Blinkit" and "Zepto"
     * look just like "Rahul".
     */
    static boolean looksLikePerson(String payee, String original) {
        if (MASKED_CONTACT.matcher(original).find()) return true;
        String compact = payee.replaceAll("\\s+", "");
        if (PHONE_VPA.matcher(compact).matches()) return true;

        String cleaned = payee.replaceAll("[.,]", " ").trim();
        if (cleaned.isEmpty() || cleaned.matches(".*\\d.*") || cleaned.contains("@")
                || cleaned.contains("&") || cleaned.contains("_")) {
            return false;
        }
        List<String> tokens = List.of(cleaned.toLowerCase(Locale.ROOT).split("\\s+"));
        long nameWords = tokens.stream().filter(t -> !NAME_PARTICLES.contains(t)).count();
        // "Mohd Azmal", "MD NASIER": an honorific plus a name is a person too
        if (tokens.size() < 2 || nameWords < 1 || nameWords > 5) return false;
        return tokens.stream().allMatch(t -> t.matches("[a-z]+") && !BUSINESS_WORDS.contains(t)
                // "Bhajewale", "Doodhwala": a seller named by what they sell
                && !t.matches(".{3,}(wale|wala|walla|vala|vale)"));
    }
}
