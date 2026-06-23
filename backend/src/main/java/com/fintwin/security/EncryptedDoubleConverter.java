package com.fintwin.security;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

@Converter
public class EncryptedDoubleConverter implements AttributeConverter<Double, String> {

    // Delegate to the shared AES-256/GCM converter — same key, same IV-per-encrypt
    private static final EncryptionConverter STRING_CONV = new EncryptionConverter();

    @Override
    public String convertToDatabaseColumn(Double value) {
        if (value == null) return null;
        return STRING_CONV.convertToDatabaseColumn(value.toString());
    }

    @Override
    public Double convertToEntityAttribute(String stored) {
        if (stored == null) return null;
        String plain = STRING_CONV.convertToEntityAttribute(stored);
        if (plain == null) return null;
        try {
            return Double.parseDouble(plain);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
