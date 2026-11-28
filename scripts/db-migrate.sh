#!/usr/bin/env bash
# Runs the backend's pending Flyway migrations against the database in
# backend/.env (the shared database; Cloud Run has Flyway turned off).
#   scripts/db-migrate.sh           # shows the current version and what's pending
#   scripts/db-migrate.sh --apply   # runs them
# Uses Flyway and the Postgres driver from the local Maven cache (~/.m2),
# so build the backend once first. Prints versions only, never settings.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
R="$HOME/.m2/repository"
latest() { ls -d "$1"/*/ 2>/dev/null | sort -V | tail -1; }
jar() { local d; d=$(latest "$1"); ls "$d"*.jar | grep -v -E 'sources|javadoc' | head -1; }
CP="$(jar "$R/org/flywaydb/flyway-core"):$(jar "$R/org/flywaydb/flyway-database-postgresql"):$(jar "$R/org/postgresql/postgresql")"
for a in jackson-databind jackson-core jackson-annotations; do CP="$CP:$(jar "$R/com/fasterxml/jackson/core/$a")"; done
CP="$CP:$(jar "$R/com/fasterxml/jackson/dataformat/jackson-dataformat-toml")"
exec java -cp "$CP" "$ROOT/scripts/db-migrate/Migrate.java" \
  "$ROOT/backend/.env" "$ROOT/backend/src/main/resources/db/migration" "$@"
