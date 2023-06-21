FROM ghcr.io/liquidai-project/wasmiot-orchestrator AS app

FROM app AS devcontainer

WORKDIR /app

# Install docker-from-docker using devcontainer script
COPY .devcontainer/library-scripts/docker-from-docker.sh /tmp/library-scripts/
RUN bash /tmp/library-scripts/docker-from-docker.sh

# Install nodemon (https://nodemon.io/) for automatic reloads on code changes.
RUN npm install -g nodemon

USER node

COPY . .

RUN mkdir -p /home/node/.vscode-server/extensions

CMD nodejs fileserv/server.js
