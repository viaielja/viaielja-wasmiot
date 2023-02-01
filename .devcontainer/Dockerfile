FROM "mcr.microsoft.com/devcontainers/javascript-node:0-18"

WORKDIR /app

# Install dependencies first in order to not rebuild every time code changes.
COPY ./fileserv/package.json /app/fileserv/package.json
RUN npm install ./fileserv

COPY ./fileserv /app/fileserv