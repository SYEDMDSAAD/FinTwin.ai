package com.fintwin.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.ImportMappingEvent;
import com.fintwin.model.User;
import com.fintwin.repository.ImportMappingEventRepository;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Which statement formats the import page reads correctly on its own, and
 * which ones users had to fix by hand — so support for more banks can be
 * added where it's needed. Only the header row and the column choices are
 * kept, never transaction rows.
 */
@Service
public class ImportFeedbackService {

    static final Set<String> FIELDS = Set.of("date", "merchant", "amount", "debit", "credit",
            "direction", "category", "balance", "debitCreditMode", "flipSign");

    private final ImportMappingEventRepository events;
    private final UserRepository users;
    private final ObjectMapper json;

    public ImportFeedbackService(ImportMappingEventRepository events, UserRepository users, ObjectMapper json) {
        this.events = events;
        this.users = users;
        this.json = json;
    }

    /** Header cells as kept: trimmed, capped, long digit runs removed (a misread data row can't leak an account number). */
    static List<String> cleanHeaders(List<?> raw) {
        if (raw == null) return List.of();
        return raw.stream().limit(40)
                .map(h -> h == null ? "" : h.toString().replaceAll("\\d{4,}", "#").trim())
                .map(h -> h.length() > 40 ? h.substring(0, 40) : h)
                .toList();
    }

    /** Same headers, same format — however the bank capitalises or spaces them. */
    static String formatKey(List<String> headers) {
        String norm = String.join("|", headers.stream()
                .map(h -> h.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim()).toList());
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(norm.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Only the known mapping fields, each a header name (capped) or a boolean. */
    static Map<String, Object> cleanMapping(Object raw) {
        Map<String, Object> out = new TreeMap<>();
        if (!(raw instanceof Map<?, ?> m)) return out;
        m.forEach((k, v) -> {
            if (!(k instanceof String key) || !FIELDS.contains(key) || v == null) return;
            if (v instanceof Boolean b) out.put(key, b);
            else if (!v.toString().isBlank()) {
                String s = v.toString().replaceAll("\\d{4,}", "#").trim();
                out.put(key, s.length() > 40 ? s.substring(0, 40) : s);
            }
        });
        return out;
    }

    public Map<String, Object> record(Map<String, Object> body) {
        User user = users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
        if (!(body.get("headers") instanceof List<?> rawHeaders) || rawHeaders.isEmpty())
            throw new BadRequestException("headers are required");

        List<String> headers = cleanHeaders(rawHeaders);
        Map<String, Object> detected = cleanMapping(body.get("detected"));
        Map<String, Object> fin = cleanMapping(body.get("final"));

        ImportMappingEvent e = new ImportMappingEvent();
        e.setUser(user);
        e.setHeaders(write(headers));
        e.setFormatKey(formatKey(headers));
        e.setFileType(clip(body.get("fileType"), 10));
        e.setDetectedFormat(clip(body.get("detectedFormat"), 40));
        e.setDetectedMapping(write(detected));
        e.setFinalMapping(write(fin));
        e.setChanged(!detected.equals(fin));
        e.setRowsImported(body.get("rows") instanceof Number n ? n.intValue() : null);
        e.setCreatedAt(LocalDateTime.now());
        events.save(e);
        return Map.of("changed", e.getChanged());
    }

    /** Admin: each statement format seen, how often it's imported, and how often its columns needed fixing. */
    public List<Map<String, Object>> formats() {
        Map<String, List<ImportMappingEvent>> byFormat = new LinkedHashMap<>();
        for (ImportMappingEvent e : events.findAllByOrderByCreatedAtDesc())
            byFormat.computeIfAbsent(e.getFormatKey(), k -> new ArrayList<>()).add(e);

        List<Map<String, Object>> out = new ArrayList<>();
        byFormat.forEach((key, list) -> {
            long fixed = list.stream().filter(e -> Boolean.TRUE.equals(e.getChanged())).count();
            Set<Long> people = new HashSet<>();
            list.forEach(e -> people.add(e.getUser().getId()));
            ImportMappingEvent latest = list.get(0);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("formatKey", key);
            m.put("headers", read(latest.getHeaders()));
            m.put("fileType", latest.getFileType());
            m.put("detectedFormat", latest.getDetectedFormat());
            m.put("imports", list.size());
            m.put("users", people.size());
            m.put("fixedByHand", fixed);
            m.put("fixRate", Math.round(fixed * 1000.0 / list.size()) / 10.0);
            m.put("lastDetected", readMap(latest.getDetectedMapping()));
            m.put("lastFinal", readMap(latest.getFinalMapping()));
            m.put("lastSeen", latest.getCreatedAt());
            out.add(m);
        });
        out.sort(Comparator.comparingLong((Map<String, Object> m) -> -(long) m.get("fixedByHand"))
                .thenComparing(m -> -(int) m.get("imports")));
        return out;
    }

    private String write(Object o) {
        try { return json.writeValueAsString(o); } catch (JsonProcessingException e) { return null; }
    }

    private List<String> read(String s) {
        try { return s == null ? List.of() : json.readValue(s, new TypeReference<>() {}); }
        catch (JsonProcessingException e) { return List.of(); }
    }

    private Map<String, Object> readMap(String s) {
        try { return s == null ? Map.of() : json.readValue(s, new TypeReference<>() {}); }
        catch (JsonProcessingException e) { return Map.of(); }
    }

    private static String clip(Object v, int max) {
        if (v == null) return null;
        String s = v.toString().trim();
        return s.isEmpty() ? null : s.length() > max ? s.substring(0, max) : s;
    }
}
