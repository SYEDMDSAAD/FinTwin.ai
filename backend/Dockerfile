# ── Build stage ───────────────────────────────────────────────────────────────
# Use the official Maven image — avoids slow `apk add maven` and gets a proper
# .m2 cache layer from the `dependency:go-offline` step.
FROM maven:3.9-eclipse-temurin-21-alpine AS build

WORKDIR /app

# Resolve dependencies first — this layer is cached unless pom.xml changes.
COPY pom.xml .
RUN mvn dependency:go-offline -q

COPY src ./src
RUN mvn package -DskipTests -q

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM eclipse-temurin:25-jre-alpine

WORKDIR /app

# Non-root user for security — containers should not run as root.
RUN addgroup -S fintwin && adduser -S fintwin -G fintwin
USER fintwin

COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

# JVM flags tuned for containers:
#   UseContainerSupport    — respects cgroup memory limits (default in JDK 10+, explicit here for clarity)
#   MaxRAMPercentage=75    — leave 25% headroom for OS + non-heap
#   G1GC                   — best general-purpose GC for server workloads
#   ExitOnOutOfMemoryError — restart instead of limping with a broken heap
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-XX:InitialRAMPercentage=25.0", \
    "-XX:+UseG1GC", \
    "-XX:+ExitOnOutOfMemoryError", \
    "-jar", "app.jar"]
