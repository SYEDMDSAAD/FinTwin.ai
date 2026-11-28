package com.fintwin.service;

import com.fintwin.audit.Audited;
import com.fintwin.exception.BadRequestException;
import com.fintwin.exception.NotFoundException;
import com.fintwin.model.User;
import com.fintwin.repository.UserRepository;
import com.fintwin.security.SecurityUtils;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The user's AI preferences: the Copilot's default mode and whether Home
 * shows the daily recap. Kept on the server so they follow the user to
 * another phone or the website, and so the Copilot answers in the chosen
 * mode even when the app doesn't say which.
 */
@Service
public class AiPreferencesService {

    /** Same list as frontend/src/constants/aiModes.js and the advisor prompt. */
    public static final List<String> MODES = List.of(
            "Savings Advisor", "Investment Advisor", "Budget Coach", "Fraud Analyst", "Purchase Advisor");
    public static final String DEFAULT_MODE = "Savings Advisor";

    private final UserRepository users;

    public AiPreferencesService(UserRepository users) {
        this.users = users;
    }

    @PreAuthorize("hasAuthority('READ_OWN_PROFILE')")
    public Map<String, Object> get() {
        return body(currentUser());
    }

    /** Either field may be left out to keep it as it is. */
    @PreAuthorize("hasAuthority('WRITE_OWN_PROFILE')")
    @Audited(action = "WRITE", resource = "profile", description = "AI preferences updated")
    @Transactional
    public Map<String, Object> update(String mode, Boolean dailyInsights) {
        User user = currentUser();
        if (mode != null) {
            if (!MODES.contains(mode)) throw new BadRequestException("Unknown AI mode");
            user.setAiMode(mode);
        }
        if (dailyInsights != null) user.setDailyInsights(dailyInsights);
        users.save(user);
        return body(user);
    }

    /** The mode to answer in: the one asked for, else the user's saved one. */
    public static String modeFor(User user, String asked) {
        if (asked != null && !asked.isBlank()) return asked;
        String saved = user == null ? null : user.getAiMode();
        return saved != null && MODES.contains(saved) ? saved : DEFAULT_MODE;
    }

    private static Map<String, Object> body(User user) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", modeFor(user, null));
        out.put("dailyInsights", user.isDailyInsights());
        out.put("modes", MODES);
        return out;
    }

    private User currentUser() {
        return users.findByEmail(SecurityUtils.getCurrentUserEmail())
                .orElseThrow(() -> new NotFoundException("User not found"));
    }
}
