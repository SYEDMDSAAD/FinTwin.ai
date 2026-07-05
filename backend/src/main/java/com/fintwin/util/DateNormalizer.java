package com.fintwin.util;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * Single place to turn external date strings (CSV imports, bank payloads,
 * manual entry) into LocalDate. Transaction dates are stored as LocalDate;
 * every String ingest point must normalize through here so that malformed
 * or regional formats (DD/MM/YYYY, DD-MM-YYYY) can never reach the database.
 */
public final class DateNormalizer {

    private static final DateTimeFormatter DMY_SLASH = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DMY_DASH  = DateTimeFormatter.ofPattern("dd-MM-yyyy");
    private static final DateTimeFormatter YMD_SLASH = DateTimeFormatter.ofPattern("yyyy/MM/dd");

    private DateNormalizer() {}

    /**
     * Parses ISO (YYYY-MM-DD, optionally with a time suffix), DD/MM/YYYY,
     * DD-MM-YYYY, or YYYY/MM/DD. Returns null when unparseable — callers
     * decide whether to skip the row or substitute a default.
     */
    public static LocalDate parseFlexible(String s) {
        if (s == null || s.isBlank()) return null;
        String v = s.trim();
        // ISO timestamp ("2026-07-05T10:15:30" or "2026-07-05 10:15:30") → date part
        if (v.length() > 10 && (v.charAt(10) == 'T' || v.charAt(10) == ' ')) {
            v = v.substring(0, 10);
        }
        try { return LocalDate.parse(v); } catch (Exception ignored) {}
        try { return LocalDate.parse(v, DMY_SLASH); } catch (Exception ignored) {}
        try { return LocalDate.parse(v, DMY_DASH); } catch (Exception ignored) {}
        try { return LocalDate.parse(v, YMD_SLASH); } catch (Exception ignored) {}
        return null;
    }
}
