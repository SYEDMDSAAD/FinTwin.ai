package com.fintwin.demo;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Keeps the shared demo account read-only. Everyone who clicks "Try the demo"
 * is in the same account, so one visitor's edit would be the next visitor's
 * data, and their ratings and corrections would land in the training data.
 *
 * The DEMO role already lacks every write permission; this catches endpoints
 * that don't check one. Runs after JwtFilter, so the user is known.
 */
@Component
public class DemoReadOnlyFilter extends OncePerRequestFilter {

    public static final String READ_ONLY_CODE = "demo_read_only";
    static final String READ_ONLY_MESSAGE =
            "This is a demo account, so nothing can be changed here. "
            + "Sign up to do this with your own data.";

    // Writes the demo needs: the copilot, clearing one's own chat, and the
    // app reporting the visit (pages, sign-up clicks) for the admin page
    private static final List<Rule> ALLOWED = List.of(
            new Rule("POST", "/api/v1/transactions/chat"),
            new Rule("POST", "/api/v1/demo/event"),
            new Rule("POST", "/api/v1/visits"),
            // Building and regenerating goals, kept per visitor (GoalPlannerService)
            new Rule("POST", "/api/v1/goals"),
            new Rule("POST", "/api/v1/goals/\\d+/(regenerate|complete)"),
            new Rule("PUT", "/api/v1/goals/\\d+"),
            new Rule("DELETE", "/api/v1/goals/\\d+"),
            new Rule("DELETE", "/api/v1/transactions/chat/history(/\\d+)?"));

    // Writes the app makes by itself (marking things seen). Answered as done
    // without doing them, so visitors don't get error messages they caused
    // by opening a page
    private static final List<Rule> SILENTLY_IGNORED = List.of(
            new Rule("POST", "/api/v1/daily-recap/seen"),
            new Rule("POST", "/api/v1/notifications/refresh"),
            new Rule("PUT", "/api/v1/notifications/\\d+/read"),
            new Rule("DELETE", "/api/v1/notifications/\\d+"));

    private final DemoActivityRecorder activity;

    public DemoReadOnlyFilter(DemoActivityRecorder activity) {
        this.activity = activity;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String method = request.getMethod();
        if (!isDemo() || "GET".equals(method) || "HEAD".equals(method) || "OPTIONS".equals(method)) {
            chain.doFilter(request, response);
            return;
        }
        String path = request.getRequestURI();
        if (matches(ALLOWED, method, path)) {
            chain.doFilter(request, response);
            return;
        }
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        if (matches(SILENTLY_IGNORED, method, path)) {
            response.setStatus(HttpServletResponse.SC_OK);
            response.getWriter().write("{\"demo\":true}");
            return;
        }
        activity.blocked(request, method + " " + path);
        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.getWriter().write("{\"error\":\"" + READ_ONLY_MESSAGE + "\",\"code\":\"" + READ_ONLY_CODE + "\"}");
    }

    private static boolean isDemo() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> ("ROLE_" + DemoSession.ROLE).equals(a.getAuthority()));
    }

    private static boolean matches(List<Rule> rules, String method, String path) {
        return rules.stream().anyMatch(r -> r.method.equals(method) && r.path.matcher(path).matches());
    }

    private record Rule(String method, Pattern path) {
        Rule(String method, String path) {
            this(method, Pattern.compile(path));
        }
    }
}
