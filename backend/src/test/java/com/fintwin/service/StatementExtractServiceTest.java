package com.fintwin.service;

import com.fintwin.exception.ApiException;
import com.fintwin.exception.BadRequestException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StatementExtractServiceTest {

    @Mock private RestTemplate aiRestTemplate;
    private StatementExtractService service;

    private static final String URL = "http://ai:8000/statements/extract";

    @BeforeEach
    void setUp() {
        service = new StatementExtractService(aiRestTemplate, "http://ai:8000");
    }

    private static MockMultipartFile pdf() {
        return new MockMultipartFile("file", "HDFC_Sept.PDF", "application/pdf",
                "%PDF-1.7 fake".getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void returnsTheReadersGrid() {
        List<List<String>> grid = List.of(List.of("Date", "Narration"), List.of("01/09/26", "UPI/SWIGGY"));
        when(aiRestTemplate.postForEntity(eq(URL), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(ResponseEntity.ok(Map.of("grid", grid, "format", "pdf", "pages", 2)));

        Map<String, Object> out = service.extract(pdf(), null);

        assertThat(out).containsEntry("grid", grid).containsEntry("format", "pdf").containsEntry("pages", 2);
    }

    @Test
    @SuppressWarnings("unchecked")
    void forwardsThePasswordOnlyWhenGiven() {
        when(aiRestTemplate.postForEntity(eq(URL), any(HttpEntity.class), eq(Map.class)))
                .thenReturn(ResponseEntity.ok(Map.of("grid", List.of(), "format", "pdf", "pages", 1)));
        ArgumentCaptor<HttpEntity<MultiValueMap<String, Object>>> sent = ArgumentCaptor.forClass(HttpEntity.class);

        service.extract(pdf(), "SAAD0109");
        service.extract(pdf(), "");

        verify(aiRestTemplate, org.mockito.Mockito.times(2)).postForEntity(eq(URL), sent.capture(), eq(Map.class));
        assertThat(sent.getAllValues().get(0).getBody().getFirst("password")).isEqualTo("SAAD0109");
        assertThat(sent.getAllValues().get(1).getBody().containsKey("password")).isFalse();
    }

    @Test
    void passesTheReadersReasonThrough() {
        String body = "{\"detail\":{\"code\":\"password_required\",\"message\":\"This PDF is password-protected.\"}}";
        when(aiRestTemplate.postForEntity(eq(URL), any(HttpEntity.class), eq(Map.class)))
                .thenThrow(HttpClientErrorException.create(HttpStatus.UNPROCESSABLE_ENTITY, "Unprocessable",
                        null, body.getBytes(StandardCharsets.UTF_8), StandardCharsets.UTF_8));

        assertThatThrownBy(() -> service.extract(pdf(), null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.UNPROCESSABLE_ENTITY);
                    assertThat(e.getCode()).isEqualTo("password_required");
                    assertThat(e.getMessage()).isEqualTo("This PDF is password-protected.");
                });
    }

    @Test
    void aRefusedInternalKeyIsOurFaultNotTheFiles() {
        when(aiRestTemplate.postForEntity(eq(URL), any(HttpEntity.class), eq(Map.class)))
                .thenThrow(HttpClientErrorException.create(HttpStatus.FORBIDDEN, "Forbidden", null, new byte[0], null));

        assertThatThrownBy(() -> service.extract(pdf(), null))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY);
                    assertThat(e.getCode()).isEqualTo("reader_unavailable");
                });
    }

    @Test
    void anUnreachableReaderIsABadGateway() {
        when(aiRestTemplate.postForEntity(eq(URL), any(HttpEntity.class), eq(Map.class)))
                .thenThrow(new ResourceAccessException("Connection refused"));

        assertThatThrownBy(() -> service.extract(pdf(), null))
                .isInstanceOfSatisfying(ApiException.class,
                        e -> assertThat(e.getStatus()).isEqualTo(HttpStatus.BAD_GATEWAY));
    }

    @Test
    void rejectsEmptyWrongTypeAndOversizedFilesBeforeCallingTheReader() {
        MockMultipartFile empty = new MockMultipartFile("file", "s.pdf", "application/pdf", new byte[0]);
        MockMultipartFile image = new MockMultipartFile("file", "s.png", "image/png", new byte[]{1});
        MockMultipartFile huge = new MockMultipartFile("file", "s.xlsx", "application/octet-stream",
                new byte[(int) StatementExtractService.MAX_BYTES + 1]);

        assertThatThrownBy(() -> service.extract(empty, null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.extract(image, null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.extract(huge, null)).isInstanceOf(BadRequestException.class);
        verifyNoInteractions(aiRestTemplate);
    }
}
