package com.fintwin.security;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.expression.method.DefaultMethodSecurityExpressionHandler;
import org.springframework.security.access.expression.method.MethodSecurityExpressionHandler;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;

import org.springframework.security.authentication
        .AuthenticationManager;

import org.springframework.security.config.annotation.authentication.configuration
        .AuthenticationConfiguration;

import org.springframework.security.config.annotation.web.builders
        .HttpSecurity;

import org.springframework.security.config.http
        .SessionCreationPolicy;

import org.springframework.security.crypto.bcrypt
        .BCryptPasswordEncoder;

import org.springframework.security.crypto.password
        .PasswordEncoder;

import org.springframework.security.web
        .SecurityFilterChain;

import org.springframework.security.web.authentication
        .UsernamePasswordAuthenticationFilter;

import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.http.HttpMethod;

import org.springframework.beans.factory.annotation.Value;

import java.util.Arrays;
import java.util.List;

@Configuration
@EnableMethodSecurity(prePostEnabled = true, securedEnabled = true)
public class SecurityConfig {

        private final JwtFilter jwtFilter;
        private final RateLimitFilter rateLimitFilter;

        @Autowired
        private FinTwinPermissionEvaluator finTwinPermissionEvaluator;

        @Value("${cors.allowed-origins}")
        private String allowedOriginsRaw;

        public SecurityConfig(
                JwtFilter jwtFilter,
                RateLimitFilter rateLimitFilter
        ) {
                this.jwtFilter = jwtFilter;
                this.rateLimitFilter = rateLimitFilter;
        }

        @Bean
        public CorsConfigurationSource corsConfigurationSource() {

        List<String> allowedOrigins = Arrays.asList(
                allowedOriginsRaw.split(",")
        );

        CorsConfiguration configuration =
                new CorsConfiguration();

        configuration.setAllowedOrigins(allowedOrigins);

        configuration.setAllowedMethods(
                List.of(
                        "GET",
                        "POST",
                        "PUT",
                        "PATCH",
                        "DELETE",
                        "OPTIONS"
                )
        );

        configuration.setAllowedHeaders(
                List.of(
                        "Authorization",
                        "Content-Type"
                )
        );

        configuration.setAllowCredentials(
                true
        );

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration(
                "/**",
                configuration
        );

        return source;
        }

        @Bean
        public MethodSecurityExpressionHandler methodSecurityExpressionHandler() {
                DefaultMethodSecurityExpressionHandler handler = new DefaultMethodSecurityExpressionHandler();
                handler.setPermissionEvaluator(finTwinPermissionEvaluator);
                return handler;
        }

        @Bean
        public PasswordEncoder passwordEncoder() {

                return new BCryptPasswordEncoder(12);
        }

        @Bean
        public AuthenticationManager
        authenticationManager(

                AuthenticationConfiguration config

        ) throws Exception {

                return config
                        .getAuthenticationManager();
        }

    @Bean
    public SecurityFilterChain
    securityFilterChain(

            HttpSecurity http

    ) throws Exception {

        http

                .cors(cors -> {})
                
                .csrf(csrf ->
                        csrf.disable()
                )

                .sessionManagement(session ->

                        session.sessionCreationPolicy(

                                SessionCreationPolicy
                                        .STATELESS
                        )
                )

                .headers(headers -> headers

                .contentSecurityPolicy(csp ->
                        csp.policyDirectives(
                        "default-src 'self';"
                        )
                )

                .frameOptions(frame ->
                        frame.deny()
                )

                .httpStrictTransportSecurity(hsts ->
                        hsts.includeSubDomains(true)
                        .maxAgeInSeconds(31536000)
                )

                )

                .authorizeHttpRequests(auth ->

                        auth

                                .requestMatchers(
                                        HttpMethod.OPTIONS,
                                        "/**"
                                )
                                .permitAll()

                                // /me and phone OTP require authentication; must come before the broad auth/** rule
                                .requestMatchers("/api/v1/auth/me")
                                .authenticated()

                                // Phone OTP endpoints look up the current user — anonymous callers must be rejected here
                                .requestMatchers("/api/v1/auth/phone/**")
                                .authenticated()

                                .requestMatchers(
                                        "/api/v1/auth/**"
                                )
                                .permitAll()

                                // Setu calls this without JWT
                                .requestMatchers(
                                        "/api/v1/bank/webhook"
                                )
                                .permitAll()

                                // Admin endpoints authenticate via X-Admin-Key header, not JWT
                                .requestMatchers("/admin/**")
                                .permitAll()

                                // AI-service tool calls authenticate via X-Internal-Key header
                                // (checked in InternalAIController), not JWT
                                .requestMatchers("/internal/ai/**")
                                .permitAll()

                                // Public market proxy — fetches Yahoo Finance server-side, no user context needed
                                .requestMatchers("/api/v1/market/**")
                                .permitAll()

                                // Support tickets — users submit from login page (unauthenticated)
                                .requestMatchers(HttpMethod.POST, "/api/v1/tickets")
                                .permitAll()

                                // OpenAPI docs — public in dev, disabled in prod via SWAGGER_ENABLED
                                .requestMatchers("/api-docs/**", "/swagger-ui/**", "/swagger-ui.html")
                                .permitAll()

                                // Liveness/readiness probes (k8s) and Prometheus scrape must be
                                // reachable without a JWT. Other actuator endpoints stay secured.
                                .requestMatchers("/actuator/health/**", "/actuator/prometheus")
                                .permitAll()

                                // Admin API — requires JWT + ADMIN role
                                .requestMatchers("/api/v1/admin/**")
                                .hasRole("ADMIN")

                                .anyRequest()
                                .authenticated()
                )

                // Spring Security 6 defaults to Http403ForbiddenEntryPoint for anonymous users.
                // Write responses directly (NOT sendError) — sendError triggers a Tomcat re-dispatch
                // to /error which goes back through Spring Security as anonymous, turning 403 into 401.
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> {
                                res.setStatus(jakarta.servlet.http.HttpServletResponse.SC_UNAUTHORIZED);
                                res.setContentType("application/json");
                                res.getWriter().write("{\"error\":\"Unauthorized\"}");
                        })
                        .accessDeniedHandler((req, res, ex) -> {
                                res.setStatus(jakarta.servlet.http.HttpServletResponse.SC_FORBIDDEN);
                                res.setContentType("application/json");
                                res.getWriter().write("{\"error\":\"Forbidden\"}");
                        })
                )

                .addFilterBefore(
                        rateLimitFilter,
                        UsernamePasswordAuthenticationFilter.class
                )

                .addFilterBefore(
                        jwtFilter,
                        UsernamePasswordAuthenticationFilter.class
                );

        return http.build();
    }
}