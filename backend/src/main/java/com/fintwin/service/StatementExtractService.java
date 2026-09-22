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
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Reads a PDF or Excel statement into a grid of cells by way of the AI
 * service, which has the PDF and spreadsheet parsers.
 *
 * Nothing is saved here. The grid goes back to the browser, where the same
 * column-mapping and preview step as a CSV upload runs, and the user's
 * confirmed rows then arrive through the ordinary batch import. The file and
 * the PDF password exist only for the length of this request, and neither is
 * ever logged.
 */
@Service
public class StatementExtractService {

    private static final Logger log = LoggerFactory.getLogger(StatementExtractService.class);

    static final long MAX_BYTES = 25L * 1024 * 1024;

    // The AI service decides the real type from the file's bytes; the name is
    // only a first filter against obviously wrong uploads.
    private static final Set<String> EXTENSIONS = Set.of("pdf", "xls", "xlsx");

    private final RestTemplate aiRestTemplate;
    private final String aiServiceUrl;
    private final ObjectMapper mapper = new ObjectMapper();

    public StatementExtractService(@Qualifier("aiStatementRestTemplate") RestTemplate aiRestTemplate,
                                   @Value("${ai.service.url}") String aiServiceUrl) {
        this.aiRestTemplate = aiRestTemplate;
        this.aiServiceUrl = aiServiceUrl;
    }

    @PreAuthorize("hasAuthority('WRITE_OWN_TRANSACTIONS')")
    public Map<String, Object> extract(MultipartFile file, String password) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Choose a statement file to upload.");
        }
        if (file.getSize() > MAX_BYTES) {
            throw new BadRequestException("File too large. Maximum statement size is 25 MB.");
        }
        String name = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = name.contains(".")
                ? name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT)
                : "";
        if (!EXTENSIONS.contains(ext)) {
            throw new BadRequestException("Upload a PDF or Excel statement (.pdf, .xls, .xlsx).");
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new BadRequestException("The file could not be read. Try uploading it again.");
        }

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return "statement." + ext;
            }
        });
        if (password != null && !password.isEmpty()) {
            body.add("password", password);
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        ResponseEntity<Map> response;
        try {
            response = aiRestTemplate.postForEntity(
                    aiServiceUrl + "/statements/extract", new HttpEntity<>(body, headers), Map.class);
        } catch (HttpClientErrorException e) {
            throw readerError(e);
        } catch (RestClientException e) {
            log.warn("Statement reader unreachable: {}", e.getClass().getSimpleName());
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "The statement reader is unavailable right now. Try again, or upload a CSV.",
                    "reader_unavailable");
        }

        Map<?, ?> result = response.getBody();
        if (result == null || !(result.get("grid") instanceof List<?> grid)) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "The statement reader returned no table.", "reader_unavailable");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("grid", grid);
        out.put("format", result.get("format"));
        out.put("pages", result.get("pages"));
        return out;
    }

    /**
     * Passes the reader's own reason through ("password_required",
     * "scanned_pdf", ...) so the page can ask for a password or explain what
     * to download instead, rather than showing a generic failure.
     */
    private ApiException readerError(HttpClientErrorException e) {
        String code = "unreadable";
        String message = "This file could not be read.";
        try {
            JsonNode detail = mapper.readTree(e.getResponseBodyAsString()).path("detail");
            if (detail.hasNonNull("code")) code = detail.get("code").asText();
            if (detail.hasNonNull("message")) message = detail.get("message").asText();
        } catch (Exception ignored) {
            // keep the generic reason
        }
        if (e.getStatusCode().value() == 403) {
            // Our own internal key was refused: a deployment problem, not the user's file
            log.error("AI service refused the internal key on /statements/extract");
            return new ApiException(HttpStatus.BAD_GATEWAY,
                    "The statement reader is unavailable right now.", "reader_unavailable");
        }
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, message, code);
    }
}
