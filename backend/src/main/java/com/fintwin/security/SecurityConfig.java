package com.fintwin.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

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
public class SecurityConfig {

        private final JwtFilter jwtFilter;
        private final RateLimitFilter rateLimitFilter;

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

                                .requestMatchers(
                                        "/api/auth/**"
                                )
                                .permitAll()

                                // Setu calls this without JWT
                                .requestMatchers(
                                        "/api/bank/webhook"
                                )
                                .permitAll()

                                // Admin endpoints authenticate via X-Admin-Key header, not JWT
                                .requestMatchers("/admin/**")
                                .permitAll()

                                // Public market proxy — fetches Yahoo Finance server-side, no user context needed
                                .requestMatchers("/api/market/**")
                                .permitAll()

                                // Support tickets — users submit from login page (unauthenticated)
                                .requestMatchers(HttpMethod.POST, "/api/tickets")
                                .permitAll()

                                // Admin API — requires JWT + ADMIN role
                                .requestMatchers("/api/admin/**")
                                .hasRole("ADMIN")

                                .anyRequest()
                                .authenticated()
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