package com.fintwin.agent;

import com.fintwin.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.util.LinkedMultiValueMap;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The weekly agent's and import agent's endpoints, with the AI service unreachable (as in CI). */
@SuppressWarnings({"rawtypes"})
class AgentEndpointsIntegrationTest extends AbstractIntegrationTest {

    private ResponseEntity<Map> post(String token, String path, Object body, MediaType type) {
        HttpHeaders h = authHeaders(token);
        h.setContentType(type);
        return restTemplate.exchange(baseUrl() + path, HttpMethod.POST, new HttpEntity<>(body, h), Map.class);
    }

    @Test
    void noReportIsWrittenForAnAccountWithNothingInIt() {
        String token = seedUserAndGetToken("weekly-empty@example.com", "Test@1234");
        assertThat(post(token, "/api/v1/reports/weekly/ensure", null, MediaType.APPLICATION_JSON).getBody())
                .containsEntry("written", false);
        ResponseEntity<Map> latest = restTemplate.exchange(baseUrl() + "/api/v1/reports/weekly/latest",
                HttpMethod.GET, new HttpEntity<>(authHeaders(token)), Map.class);
        assertThat(latest.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
    }

    @Test
    void theBellStillWorksWithTheNudgeAgentsInIt() {
        String token = seedUserAndGetToken("nudge-bell@example.com", "Test@1234");
        ResponseEntity<List> bell = restTemplate.exchange(baseUrl() + "/api/v1/notifications",
                HttpMethod.GET, new HttpEntity<>(authHeaders(token)), List.class);
        assertThat(bell.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private LinkedMultiValueMap<String, Object> upload(String kind) {
        LinkedMultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new ByteArrayResource("%PDF-1.4 fake".getBytes()) {
            @Override public String getFilename() { return "policy.pdf"; }
        });
        form.add("kind", kind);
        return form;
    }

    @Test
    void theDocumentReaderChecksTheKindAndSaysWhenItIsDown() {
        String token = seedUserAndGetToken("doc-reader@example.com", "Test@1234");
        assertThat(post(token, "/api/v1/documents/extract", upload("payslip"), MediaType.MULTIPART_FORM_DATA)
                .getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        ResponseEntity<Map> down = post(token, "/api/v1/documents/extract", upload("policy"), MediaType.MULTIPART_FORM_DATA);
        assertThat(down.getStatusCode()).isEqualTo(HttpStatus.BAD_GATEWAY);
        assertThat(down.getBody()).containsEntry("code", "reader_unavailable");
    }

    @Test
    void theDocumentReaderNeedsALogin() {
        HttpHeaders h = new HttpHeaders();
        h.setContentType(MediaType.MULTIPART_FORM_DATA);
        ResponseEntity<String> r = restTemplate.exchange(baseUrl() + "/api/v1/documents/extract", HttpMethod.POST,
                new HttpEntity<>(upload("policy"), h), String.class);
        assertThat(r.getStatusCode().is4xxClientError()).isTrue();
    }
}
