package com.fintwin.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.math.BigDecimal;

/**
 * Encrypts a {@link BigDecimal} money value at rest. Delegates to the shared
 * AES-256/GCM string converter, storing the value as its plain decimal string.
 *
 * Backward compatible with {@link EncryptedDoubleConverter}: both write the value's
 * plain decimal {@code toString()} (e.g. "1234.1"), so existing encrypted columns
 * decrypt and parse unchanged — no data migration is required.
 */
@Converter
public class EncryptedBigDecimalConverter implements AttributeConverter<BigDecimal, String> {

    private static final EncryptionConverter STRING_CONV = new EncryptionConverter();

    @Override
    public String convertToDatabaseColumn(BigDecimal value) {
        if (value == null) return null;
        return STRING_CONV.convertToDatabaseColumn(value.toPlainString());
    }

    @Override
    public BigDecimal convertToEntityAttribute(String stored) {
        if (stored == null) return null;
        String plain = STRING_CONV.convertToEntityAttribute(stored);
        if (plain == null || plain.isBlank()) return null;
        try {
            return new BigDecimal(plain.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
