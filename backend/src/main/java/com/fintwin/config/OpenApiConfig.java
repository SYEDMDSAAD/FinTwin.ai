package com.fintwin.config;

import io.swagger.v3.oas.annotations.OpenAPIDefinition;
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType;
import io.swagger.v3.oas.annotations.info.Contact;
import io.swagger.v3.oas.annotations.info.Info;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.security.SecurityScheme;
import org.springframework.context.annotation.Configuration;

@OpenAPIDefinition(
    info = @Info(
        title       = "FinTwin.ai API",
        version     = "v1",
        description = "Indian Personal Finance Intelligence Platform — AES-256 encrypted, "
                    + "RBAC-protected, RBI/SEBI-aligned.",
        contact     = @Contact(name = "FinTwin Support", email = "support@fintwin.ai")
    ),
    security = @SecurityRequirement(name = "bearerAuth")
)
@SecurityScheme(
    name   = "bearerAuth",
    type   = SecuritySchemeType.HTTP,
    scheme = "bearer",
    bearerFormat = "JWT",
    description  = "JWT token from POST /api/v1/auth/login"
)
@Configuration
public class OpenApiConfig {}
