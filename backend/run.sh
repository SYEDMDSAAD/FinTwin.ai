#!/bin/bash
set -e

if [ ! -f .env ]; then
  echo "ERROR: backend/.env not found. Copy .env.example and fill in your values:"
  echo "  cp .env.example .env"
  exit 1
fi

export $(grep -v '^#' .env | grep -v '^$' | xargs)
export MAVEN_OPTS="-Xmx512m -Xms256m"
mvn spring-boot:run
