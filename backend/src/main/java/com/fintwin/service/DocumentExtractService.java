package com.fintwin.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fintwin.exception.ApiException;
import com.fintwin.exception.BadRequestException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

/**
 * The import agent: reads an insurance policy or a loan statement PDF and
 * returns the form fields it found, for the user to check and save. Nothing
 * is stored here, and the AI service masks policy, account and phone numbers
 * before its model sees the text.
 */
@Service
public class DocumentExtractService {

    private static final Logger log = LoggerFactory.getLogger(DocumentExtractService.class);
    static final long MAX_BYTES = 15L * 1024 * 1024;

    private final RestTemplate ai;
    private final String aiUrl;
    private final ObjectMapper mapper = new ObjectMapper();

    public DocumentExtractService(@Qualifier("aiStatementRestTemplate") RestTemplate ai,
                                  @Value("${ai.service.url}") String aiUrl) {
        this.ai = ai;
        this.aiUrl = aiUrl;
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_INSURANCE') or hasAuthority('WRITE_OWN_LIABILITIES')")
    public Map<String, Object> extract(MultipartFile file, String kind, String password) {
        if (!"policy".equals(kind) && !"loan".equals(kind))
            throw new BadRequestException("Choose a policy or a loan document.");
        byte[] bytes = pdfBytes(file);
        Map<?, ?> res = post("/documents/extract", bytes, Map.of("kind", kind), password);
        Object fields = res == null ? null : res.get("fields");
        return Map.of("fields", fields instanceof Map<?, ?> m ? m : Map.of());
    }

    /**
     * Holdings and their transactions from a CAS (CAMS/KFintech or NSDL/CDSL).
     * The AI service parses it without a model and drops the investor's name,
     * PAN and contact details; this returns what it found, saving nothing.
     */
    @PreAuthorize("hasAuthority('WRITE_OWN_INVESTMENTS')")
    public Map<?, ?> readCas(MultipartFile file, String password) {
        byte[] bytes = pdfBytes(file);
        Map<?, ?> res = post("/documents/cas", bytes, Map.of(), password);
        if (res == null) throw unavailable();
        return res;
    }

    private static byte[] pdfBytes(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new BadRequestException("Choose a PDF to upload.");
        if (file.getSize() > MAX_BYTES) throw new BadRequestException("That PDF is over 15 MB.");
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw new BadRequestException("The file could not be read. Try uploading it again.");
        }
    }

    private Map<?, ?> post(String path, byte[] bytes, Map<String, String> fields, String password) {
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResource(bytes) {
            @Override public String getFilename() { return "document.pdf"; }
        });
        fields.forEach(body::add);
        if (password != null && !password.isEmpty()) body.add("password", password);
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        try {
            return ai.postForObject(aiUrl + path, new HttpEntity<>(body, headers), Map.class);
        } catch (HttpClientErrorException e) {
            if (e.getStatusCode().value() == 403) {
                log.error("AI service refused the internal key on {}", path);
                throw unavailable();
            }
            throw readerError(e.getResponseBodyAsString());
        } catch (HttpServerErrorException e) {
            throw unavailable();
        } catch (RestClientException e) {
            // No file details in the log: these are personal documents
            log.warn("Document reader unreachable: {}", e.getClass().getSimpleName());
            throw unavailable();
        }
    }

    private static ApiException unavailable() {
        return new ApiException(HttpStatus.BAD_GATEWAY,
                "The document reader is unavailable right now. Fill the form by hand, or try again.",
                "reader_unavailable");
    }

    private ApiException readerError(String responseBody) {
        String code = "unreadable", message = "This PDF could not be read.";
        try {
            JsonNode detail = mapper.readTree(responseBody).path("detail");
            if (detail.hasNonNull("code")) code = detail.get("code").asText();
            if (detail.hasNonNull("message")) message = detail.get("message").asText();
        } catch (Exception ignored) {
            // keep the generic reason
        }
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, message, code);
    }
}
