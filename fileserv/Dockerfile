# README: This attempts to be a common Dockerfile for ~any~ Node-project
# with installing package.json before COPYing the source code etc.

# ALMOST (except path to package.json) same as in .devcontainer/Dockerfile:

FROM "mcr.microsoft.com/devcontainers/javascript-node:0-18"

WORKDIR /app
# Install dependencies first in order to not rebuild every time code changes.
COPY ./package.json /app/package.json
RUN npm install

COPY . /app