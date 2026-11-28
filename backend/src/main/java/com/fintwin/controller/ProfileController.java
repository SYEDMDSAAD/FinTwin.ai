package com.fintwin.controller;

import com.fintwin.dto.ProfileDTO;
import com.fintwin.service.AiPreferencesService;
import com.fintwin.service.ProfileService;
import com.fintwin.dto.ChangePasswordDTO;
import com.fintwin.dto.UpdateProfileDTO;
import com.fintwin.dto.ScoreHistoryDTO;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/profile")
public class ProfileController {

    private final ProfileService profileService;
    private final AiPreferencesService aiPreferences;

        public ProfileController(
                ProfileService profileService,
                AiPreferencesService aiPreferences
        ) {

                this.profileService =
                        profileService;
                this.aiPreferences = aiPreferences;
        }

        /** The Copilot's default mode and whether Home shows the daily recap. */
        @GetMapping("/ai-preferences")
        public Map<String, Object> getAiPreferences() {
                return aiPreferences.get();
        }

        @PutMapping("/ai-preferences")
        public Map<String, Object> updateAiPreferences(@RequestBody Map<String, Object> body) {
                Object mode = body.get("mode");
                Object daily = body.get("dailyInsights");
                return aiPreferences.update(mode instanceof String m ? m : null,
                                            daily instanceof Boolean d ? d : null);
        }

        @GetMapping
        public ProfileDTO getProfile() {

                return profileService
                        .getProfile();
        }

        @PutMapping("/change-password")
        public String changePassword(

                @RequestBody
                ChangePasswordDTO dto

        ) {

                return profileService
                        .changePassword(dto);
        }

        @PutMapping("/update")
        public String updateProfile(

                @RequestBody
                UpdateProfileDTO dto

        ) {

        return profileService
                .updateProfile(dto);
        }

        @DeleteMapping("/delete")
        public String deleteAccount() {

        return profileService
                .deleteAccount();
        }

        @GetMapping("/score-history")
        public List<ScoreHistoryDTO> getHistory() {

        return profileService.getScoreHistory().stream()
                .map(ScoreHistoryDTO::from)
                .toList();
        }

        // GDPR Article 20 — right to data portability
        @GetMapping("/export")
        public Map<String, Object> exportData() {
                return profileService.exportData();
        }
}