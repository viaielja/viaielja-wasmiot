# README: This attempts to be a common Dockerfile for ~any~ Node-project
# with installing package.json before COPYing the source code etc.

# ALMOST (except path to package.json) same as in .devcontainer/Dockerfile:

FROM "mcr.microsoft.com/devcontainers/javascript-node:0-18" AS base

WORKDIR /app

FROM base AS compose

# Install dependencies first in order to not rebuild every time code changes.
COPY ./package.json /app/package.json
RUN npm install

COPY . /app

FROM base AS server-debug

# Install dependencies first in order to not rebuild every time code changes.
COPY ./fileserv/package.json /app/fileserv/package.json
RUN npm install ./fileserv
COPY ./client/package.json /app/client/package.json
RUN npm install ./client

COPY . /app