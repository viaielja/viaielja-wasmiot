FROM "mcr.microsoft.com/devcontainers/javascript-node:0-18" AS base

################################################################################

FROM base AS compose

WORKDIR /app

# Install dependencies first in order to not rebuild every time code changes.
COPY ./package.json /app/package.json
RUN npm install

COPY . /app

################################################################################

FROM base AS devcontainer


# Install nodemon (https://nodemon.io/) for automatic reloads on code changes.
RUN npm install -g nodemon

# Install dependencies to the directory of a fake package.
COPY ./fileserv/package.json /fake_package/package.json
WORKDIR /fake_package
RUN npm install

# Set NodeJS to search for dependencies from the path where they were just
# installed into. See:
# https://nodejs.org/api/modules.html#modules_loading_from_the_global_folders
ENV NODE_PATH=/fake_package/node_modules

WORKDIR /app

COPY . /app