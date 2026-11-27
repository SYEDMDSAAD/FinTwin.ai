package com.fintwin.service;

import com.fintwin.exception.ApiException;
import com.fintwin.exception.BadRequestException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class VoiceServiceTest {

    RestTemplate rt = new RestTemplate();
    MockRestServiceServer ai = MockRestServiceServer.bindTo(rt).build();
    VoiceService voice = new VoiceService(rt, "http://ai", 3, 2);

    VoiceServiceTest() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("someone@example.com", null, List.of()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    static MockMultipartFile audio(String type, int size) {
        return new MockMultipartFile("audio", "q", type, new byte[size]);
    }

    @Test
    void passesTheRecordingOnAndReturnsTheQuestion() {
        ai.expect(requestTo("http://ai/voice/transcribe")).andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess("{\"text\":\"how is my portfolio doing?\"}", MediaType.APPLICATION_JSON));
        assertThat(voice.transcribe(audio("audio/webm;codecs=opus", 2000))).containsEntry("text", "how is my portfolio doing?");
        ai.verify();
    }

    @Test
    void refusesOddRecordingsBeforeCallingTheAi() {
        assertThatThrownBy(() -> voice.transcribe(audio("video/mp4", 10))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> voice.transcribe(audio("audio/webm", 3 * 1024 * 1024))).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> voice.speak(" ")).isInstanceOf(BadRequestException.class);
    }

    @Test
    void speaksMaskedTextAndPassesTheAiErrorOn() {
        ai.expect(requestTo("http://ai/voice/speak"))
                .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("9876543210"))))
                .andRespond(withSuccess(new byte[]{'R', 'I', 'F', 'F'}, MediaType.parseMediaType("audio/wav")));
        ai.expect(requestTo("http://ai/voice/speak")).andRespond(withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"detail\":{\"code\":\"nothing_to_say\",\"message\":\"There's nothing to read out.\"}}"));
        assertThat(voice.speak("Call me on 9876543210 about your SIP.")).startsWith((byte) 'R');
        assertThatThrownBy(() -> voice.speak("..."))
                .isInstanceOf(ApiException.class).hasMessage("There's nothing to read out.");
    }

    @Test
    void capsCallsPerDay() {
        voice.count();
        voice.count();
        voice.count();
        assertThatThrownBy(voice::count).isInstanceOf(ApiException.class).hasMessageContaining("enough talking");
    }
}
