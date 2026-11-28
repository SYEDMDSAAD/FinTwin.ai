package com.fintwin.controller;

import com.fintwin.service.VoiceService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

/** "Hey FinTwin": speech to text and the spoken answer. See {@link VoiceService}. */
@RestController
@RequestMapping("/api/v1/voice")
public class VoiceController {

    private final VoiceService voice;

    public VoiceController(VoiceService voice) {
        this.voice = voice;
    }

    @PostMapping(value = "/transcribe", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> transcribe(@RequestParam("audio") MultipartFile audio) {
        return voice.transcribe(audio);
    }

    public record SpeakRequest(String text) {}

    @PostMapping(value = "/speak", produces = "audio/wav")
    public ResponseEntity<byte[]> speak(@RequestBody SpeakRequest body) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("audio/wav"))
                .header("Cache-Control", "no-store")
                .body(voice.speak(body == null ? null : body.text()));
    }

    /**
     * The same audio as base64 in JSON. The Android app's native HTTP layer
     * hands binary bodies to the page as text, which breaks the WAV; JSON
     * survives it.
     */
    @PostMapping(value = "/speak", params = "encoding=base64", produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Map<String, String>> speakBase64(@RequestBody SpeakRequest body) {
        byte[] wav = voice.speak(body == null ? null : body.text());
        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(Map.of("audio", java.util.Base64.getEncoder().encodeToString(wav), "contentType", "audio/wav"));
    }
}
