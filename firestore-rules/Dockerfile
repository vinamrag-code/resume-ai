# Reusable environment for testing firestore.rules without installing Java locally.
# Build once:  docker build -t resume-ai-rules firestore-rules
# Java 21 + firebase-tools + the Firestore emulator are baked in, so each test run takes about a minute.
FROM node:22-trixie
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends openjdk-21-jre-headless \
 && rm -rf /var/lib/apt/lists/*
RUN npm install -g firebase-tools
# Download the emulator JAR now instead of on every run.
RUN firebase setup:emulators:firestore
WORKDIR /work
