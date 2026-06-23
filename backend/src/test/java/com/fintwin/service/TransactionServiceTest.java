package com.fintwin.service;

import com.fintwin.model.User;
import com.fintwin.repository.TransactionRepository;
import com.fintwin.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TransactionServiceTest {

    @Mock private TransactionRepository repository;
    @Mock private CategoryService categoryService;
    @Mock private ExpenseParserService parserService;
    @Mock private UserRepository userRepository;
    @Mock private ProfileService profileService;
    @Mock private RestTemplate aiRestTemplate;

    @InjectMocks private TransactionService service;

    private User user;

    @BeforeEach
    void setUp() {
        user = new User();
        ReflectionTestUtils.setField(user, "id", 1L);
        user.setEmail("test@example.com");

        ReflectionTestUtils.setField(service, "aiServiceUrl", "http://localhost:8000");

        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("test@example.com", null, List.of())
        );
    }

    // ── uploadCSV — file type validation ─────────────────────────────────────

    @Test
    void uploadCSV_rejectsNullContentType() {
        MockMultipartFile file = new MockMultipartFile("file", "data.csv", null, new byte[]{});
        assertThatThrownBy(() -> service.uploadCSV(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid file type");
    }

    @Test
    void uploadCSV_rejectsNonCsvContentType() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "evil.pdf", "application/pdf", new byte[]{1, 2, 3});
        assertThatThrownBy(() -> service.uploadCSV(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Only CSV files are accepted");
    }

    @Test
    void uploadCSV_rejectsFileLargerThan5MB() {
        byte[] bigFile = new byte[5 * 1024 * 1024 + 1];
        MockMultipartFile file = new MockMultipartFile(
                "file", "big.csv", "text/csv", bigFile);
        assertThatThrownBy(() -> service.uploadCSV(file))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("too large");
    }

    @Test
    void uploadCSV_acceptsTextCsvContentType() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        String csv = "date,merchant,amount\n2026-01-01,Swiggy,-500.0\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        when(categoryService.categorize("Swiggy")).thenReturn("Food");

        // Should not throw
        service.uploadCSV(file);
    }

    @Test
    void uploadCSV_acceptsApplicationCsvContentType() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        String csv = "date,merchant,amount\n2026-01-01,Amazon,-1200.0\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "application/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        when(categoryService.categorize("Amazon")).thenReturn("Shopping");

        service.uploadCSV(file);
    }

    @Test
    void uploadCSV_skipsRowsWithInsufficientColumns() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        // Row 1 has only 2 columns — should be skipped without throwing
        String csv = "date,merchant\n2026-01-01,Swiggy\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        service.uploadCSV(file);
    }

    @Test
    void uploadCSV_skipsRowsWithInvalidAmount() {
        when(userRepository.findByEmail("test@example.com")).thenReturn(Optional.of(user));

        // amount is not a number — row should be silently skipped
        String csv = "date,merchant,amount\n2026-01-01,Swiggy,INVALID\n";
        MockMultipartFile file = new MockMultipartFile(
                "file", "txns.csv", "text/csv",
                csv.getBytes(StandardCharsets.UTF_8));

        service.uploadCSV(file);
    }
}
