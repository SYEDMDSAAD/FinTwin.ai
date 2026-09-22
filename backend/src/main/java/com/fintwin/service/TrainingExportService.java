package com.fintwin.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.*;
import com.fintwin.repository.*;
import com.fintwin.util.Anonymizer;
import com.fintwin.util.Categorized;
import com.fintwin.util.MerchantCategorizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Training data from the beta, one JSON object per line: only users who
 * opted in ("Help improve FinTwin's AI"), people's names, phone numbers, UPI
 * IDs, emails and account numbers removed, users replaced by a pseudonym that
 * is stable across exports but can't be turned back into an account.
 * Setu sandbox rows and onboarding samples are left out — they aren't real.
 */
@Service
public class TrainingExportService {

    public static final List<String> DATASETS = List.of("categories", "copilot", "anomalies", "imports");

    private final TransactionRepository transactions;
    private final CopilotFeedbackRepository copilot;
    private final AnomalyFeedbackRepository anomalies;
    private final ImportMappingEventRepository imports;
    private final ObjectMapper json;
    private final byte[] pseudonymKey;

    public TrainingExportService(TransactionRepository transactions, CopilotFeedbackRepository copilot,
                                 AnomalyFeedbackRepository anomalies, ImportMappingEventRepository imports,
                                 ObjectMapper json,
                                 @Value("${encryption.key:}") String encryptionKey,
                                 @Value("${jwt.secret:}") String jwtSecret) {
        this.transactions = transactions;
        this.copilot = copilot;
        this.anomalies = anomalies;
        this.imports = imports;
        this.json = json;
        String secret = encryptionKey != null && !encryptionKey.isBlank() ? encryptionKey : jwtSecret;
        this.pseudonymKey = ("training-export|" + secret).getBytes(StandardCharsets.UTF_8);
    }

    /** One dataset as JSON lines. */
    @Transactional(readOnly = true)
    public List<String> export(String dataset) {
        List<Map<String, Object>> rows = switch (dataset) {
            case "categories" -> categories();
            case "copilot" -> copilot();
            case "anomalies" -> anomalies();
            case "imports" -> imports();
            default -> throw new NotFoundException("Unknown dataset");
        };
        List<String> lines = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            try { lines.add(json.writeValueAsString(r)); } catch (JsonProcessingException ignored) { }
        }
        return lines;
    }

    /** How many rows each dataset would export right now. */
    @Transactional(readOnly = true)
    public Map<String, Integer> counts() {
        Map<String, Integer> out = new LinkedHashMap<>();
        out.put("categories", categories().size());
        out.put("copilot", copilot.findConsented().size());
        out.put("anomalies", anomalies.findConsented().size());
        out.put("imports", imports.findConsented().size());
        return out;
    }

    // ── Datasets ──────────────────────────────────────────────────────────────

    /** Each categorised transaction: the text, what FinTwin predicted and how, what it ended as. */
    List<Map<String, Object>> categories() {
        List<Transaction> all = transactions.findConsentedLabelled().stream().filter(t -> !sampleData(t)).toList();
        Map<Long, Anonymizer> scrub = anonymizers(all);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Transaction t : all) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("user", pseudonym(t.getUser()));
            r.put("merchant", scrub.get(t.getUser().getId()).merchant(t.getMerchant()));
            r.put("direction", t.getAmount() == null ? null : t.getAmount() < 0 ? "out" : "in");
            r.put("amount", roughAmount(t.getAmount()));
            r.put("channel", channel(t));
            r.put("dayOfWeek", t.getDate() == null ? null : t.getDate().getDayOfWeek().toString());
            r.put("predicted", t.getPredictedCategory());
            r.put("method", t.getCategorySource());
            r.put("review", t.getCategoryReview());
            r.put("category", t.getCategory());
            out.add(r);
        }
        return out;
    }

    List<Map<String, Object>> copilot() {
        List<CopilotFeedback> all = copilot.findConsented();
        Map<Long, Anonymizer> scrub = anonymizersFor(all.stream().map(CopilotFeedback::getUser).toList());
        List<Map<String, Object>> out = new ArrayList<>();
        for (CopilotFeedback f : all) {
            Anonymizer a = scrub.get(f.getUser().getId());
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("user", pseudonym(f.getUser()));
            r.put("question", a.text(f.getQuestion()));
            r.put("answer", a.text(f.getAnswer()));
            r.put("rating", f.getRating());
            r.put("reason", f.getReason());
            r.put("mode", f.getMode());
            r.put("path", f.getPath());
            r.put("trace", a.text(f.getTrace()));
            out.add(r);
        }
        return out;
    }

    List<Map<String, Object>> anomalies() {
        List<AnomalyFeedback> all = anomalies.findConsented();
        Map<Long, Anonymizer> scrub = anonymizersFor(all.stream().map(AnomalyFeedback::getUser).toList());
        List<Map<String, Object>> out = new ArrayList<>();
        for (AnomalyFeedback f : all) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("user", pseudonym(f.getUser()));
            r.put("type", f.getAnomalyType());
            r.put("merchant", scrub.get(f.getUser().getId()).merchant(f.getMerchant()));
            r.put("category", f.getCategory());
            r.put("amount", roughAmount(f.getAmount() == null ? null : f.getAmount().doubleValue()));
            r.put("usualAmount", roughAmount(f.getAvgAmount() == null ? null : f.getAvgAmount().doubleValue()));
            r.put("multiplier", f.getMultiplier());
            r.put("severity", f.getSeverity());
            r.put("verdict", f.getVerdict());
            out.add(r);
        }
        return out;
    }

    /** Header rows and column choices only — they never held transaction data. */
    List<Map<String, Object>> imports() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (ImportMappingEvent e : imports.findConsented()) {
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("user", pseudonym(e.getUser()));
            r.put("formatKey", e.getFormatKey());
            r.put("headers", parse(e.getHeaders()));
            r.put("fileType", e.getFileType());
            r.put("detectedFormat", e.getDetectedFormat());
            r.put("detected", parse(e.getDetectedMapping()));
            r.put("final", parse(e.getFinalMapping()));
            r.put("changed", e.getChanged());
            out.add(r);
        }
        return out;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Stable across exports, not reversible without the server's key. */
    String pseudonym(User u) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(pseudonymKey, "HmacSHA256"));
            byte[] h = mac.doFinal(("user:" + u.getId()).getBytes(StandardCharsets.UTF_8));
            return "u_" + HexFormat.of().formatHex(h).substring(0, 16);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Sandbox bank data and onboarding samples aren't real spending. */
    static boolean sampleData(Transaction t) {
        return "AA".equals(channel(t)) || "SEED".equals(t.getSource())
                || Categorized.SEED.equals(t.getCategorySource());
    }

    static String channel(Transaction t) {
        if ("BANK".equals(t.getSource()) || (t.getExternalId() != null && t.getExternalId().startsWith("CARD:"))) return "AA";
        return t.getSource() == null ? "MANUAL" : t.getSource();
    }

    /** Enough to tell a chai from a flight, not the exact figure: 2 significant digits. */
    static Double roughAmount(Double amount) {
        if (amount == null || amount == 0) return amount == null ? null : 0.0;
        double a = Math.abs(amount);
        double scale = Math.pow(10, Math.floor(Math.log10(a)) - 1);
        return Math.round(a / scale) * scale;
    }

    /** Per user: their own name and the people they pay, scrubbed wherever they appear. */
    private Map<Long, Anonymizer> anonymizers(List<Transaction> txns) {
        Map<Long, Set<String>> names = new HashMap<>();
        for (Transaction t : txns) {
            Set<String> n = names.computeIfAbsent(t.getUser().getId(), k -> new HashSet<>());
            if (t.getUser().getFullName() != null) n.add(t.getUser().getFullName());
            boolean person = Categorized.PERSON.equals(t.getCategorySource())
                    || MerchantCategorizer.PEOPLE.equals(t.getCategory());
            if (person && t.getMerchant() != null) n.add(MerchantCategorizer.payeeOf(t.getMerchant()));
        }
        Map<Long, Anonymizer> out = new HashMap<>();
        names.forEach((id, n) -> out.put(id, Anonymizer.withNames(n)));
        return out;
    }

    private Map<Long, Anonymizer> anonymizersFor(List<User> users) {
        Map<Long, Set<String>> names = new HashMap<>();
        for (User u : users) {
            Set<String> n = names.computeIfAbsent(u.getId(), k -> new HashSet<>());
            if (u.getFullName() != null) n.add(u.getFullName());
        }
        // The people each user pays, from their own transactions
        for (Transaction t : transactions.findConsentedLabelled()) {
            Set<String> n = names.get(t.getUser().getId());
            if (n == null || t.getMerchant() == null) continue;
            if (Categorized.PERSON.equals(t.getCategorySource()) || MerchantCategorizer.PEOPLE.equals(t.getCategory()))
                n.add(MerchantCategorizer.payeeOf(t.getMerchant()));
        }
        Map<Long, Anonymizer> out = new HashMap<>();
        names.forEach((id, n) -> out.put(id, Anonymizer.withNames(n)));
        return out;
    }

    private Object parse(String s) {
        try { return s == null ? null : json.readValue(s, Object.class); }
        catch (JsonProcessingException e) { return null; }
    }
}
