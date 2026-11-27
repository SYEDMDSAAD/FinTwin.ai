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
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "Hey FinTwin": the spoken question to text, and the answer to FinTwin's
 * voice, both by the AI service on Vertex AI. The wake word is spotted on the
 * device, so only the few seconds after it come here; the audio is passed
 * through and never stored or logged. The question itself then goes to the
 * copilot like a typed one (POST /transactions/chat, mode "Voice").
 */
@Service
public class VoiceService {

    private static final Logger log = LoggerFactory.getLogger(VoiceService.class);

    static final long MAX_AUDIO_BYTES = 2L * 1024 * 1024;
    static final int MAX_SPEAK_CHARS = 1000;
    static final Set<String> AUDIO_TYPES = Set.of("audio/webm", "audio/ogg", "audio/wav", "audio/x-wav",
            "audio/mp4", "audio/mpeg", "audio/aac");

    private final RestTemplate ai;
    private final String aiUrl;
    private final int perDay;
    private final int perDemoVisit;
    private final ObjectMapper mapper = new ObjectMapper();
    /** Calls today per account (or demo visit). Per instance, so a loose cap: the token allowance is the real one. */
    private final Map<String, int[]> calls = new ConcurrentHashMap<>();
    private volatile LocalDate day = LocalDate.now();

    public VoiceService(@Qualifier("aiChatRestTemplate") RestTemplate ai,
                        @Value("${ai.service.url}") String aiUrl,
                        @Value("${voice.calls-per-day:400}") int perDay,
                        @Value("${voice.calls-per-demo-visit:80}") int perDemoVisit) {
        this.ai = ai;
        this.aiUrl = aiUrl;
        this.perDay = perDay;
        this.perDemoVisit = perDemoVisit;
    }

    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    public Map<String, Object> transcribe(MultipartFile audio) {
        if (audio == null || audio.isEmpty()) throw new BadRequestException("Nothing was recorded.");
        if (audio.getSize() > MAX_AUDIO_BYTES) throw new BadRequestException("That was a long one. Ask a shorter question.");
        String type = baseType(audio.getContentType());
        if (!AUDIO_TYPES.contains(type)) throw new BadRequestException("That recording format isn't supported.");
        count();
        byte[] bytes;
        try {
            bytes = audio.getBytes();
        } catch (IOException e) {
            throw new BadRequestException("The recording could not be read. Try again.");
        }
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        HttpHeaders part = new HttpHeaders();
        part.setContentType(MediaType.parseMediaType(type));
        body.add("audio", new HttpEntity<>(new ByteArrayResource(bytes) {
            @Override public String getFilename() { return "question"; }
        }, part));
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        try {
            Map<?, ?> res = ai.postForObject(aiUrl + "/voice/transcribe", new HttpEntity<>(body, headers), Map.class);
            Object text = res == null ? null : res.get("text");
            return Map.of("text", text == null ? "" : text.toString());
        } catch (HttpClientErrorException e) {
            throw fromAi(e);
        } catch (RestClientException e) {
            log.warn("Voice transcription unavailable: {}", e.getClass().getSimpleName());
            throw unavailable("Couldn't hear that just now. Try again, or type your question.");
        }
    }

    @PreAuthorize("hasAuthority('USE_AI_COPILOT')")
    public byte[] speak(String text) {
        if (text == null || text.isBlank()) throw new BadRequestException("There's nothing to read out.");
        if (text.length() > MAX_SPEAK_CHARS) text = text.substring(0, MAX_SPEAK_CHARS);
        count();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setAccept(java.util.List.of(MediaType.parseMediaType("audio/wav")));
        try {
            byte[] wav = ai.postForObject(aiUrl + "/voice/speak",
                    new HttpEntity<>(Map.of("text", com.fintwin.util.PiiRedactor.redact(text)), headers), byte[].class);
            if (wav == null || wav.length == 0) throw unavailable("The voice is unavailable. The answer is on screen.");
            return wav;
        } catch (HttpClientErrorException e) {
            throw fromAi(e);
        } catch (RestClientException e) {
            log.warn("Voice unavailable: {}", e.getClass().getSimpleName());
            throw unavailable("The voice is unavailable. The answer is on screen.");
        }
    }

    /** A loose daily cap per account, and per visit for the shared demo account. */
    void count() {
        LocalDate today = LocalDate.now();
        if (!today.equals(day)) {
            calls.clear();
            day = today;
        }
        String demo = com.fintwin.demo.DemoSession.current().orElse(null);
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String key = demo != null ? "demo:" + demo : "user:" + (auth == null ? "?" : auth.getName());
        int limit = demo != null ? perDemoVisit : perDay;
        int used = calls.computeIfAbsent(key, k -> new int[1])[0]++;
        if (used >= limit) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "That's enough talking for today. You can still type your questions.", "voice_limit");
        }
    }

    static String baseType(String contentType) {
        return contentType == null ? "" : contentType.split(";")[0].trim().toLowerCase();
    }

    private ApiException fromAi(HttpClientErrorException e) {
        if (e.getStatusCode().value() == 403) {
            log.error("AI service refused the internal key on a voice route");
            return unavailable("Voice is unavailable right now. You can still type your question.");
        }
        if (e.getStatusCode().value() == 429) {
            return new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "You've reached today's FinTwin AI limit. It resets at midnight.", "ai_quota");
        }
        String code = "voice_error", message = "Couldn't hear that. Try again.";
        try {
            JsonNode detail = mapper.readTree(e.getResponseBodyAsString()).path("detail");
            if (detail.hasNonNull("code")) code = detail.get("code").asText();
            if (detail.hasNonNull("message")) message = detail.get("message").asText();
        } catch (Exception ignored) {
        }
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, message, code);
    }

    private static ApiException unavailable(String message) {
        return new ApiException(HttpStatus.BAD_GATEWAY, message, "voice_unavailable");
    }
}
