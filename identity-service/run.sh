#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -f ../backend/.env ]; then
  echo "ERROR: backend/.env not found. Copy backend/.env.example and fill in your values:"
  echo "  cp ../backend/.env.example ../backend/.env"
  exit 1
fi

set -a
# shellcheck source=../backend/.env
source ../backend/.env
set +a
export MAVEN_OPTS="-Xmx512m -Xms256m"
mvn spring-boot:run
