# Old contents; not sure if these have been in use lately.
#FROM node:lts-alpine
#ENV NODE_ENV=production
#WORKDIR /usr/src/app
#COPY ["package.json", "package-lock.json*", "npm-shrinkwrap.json*", "./"]
#RUN npm install --production --silent && mv node_modules ../
#COPY . .
#EXPOSE 3000
#RUN chown -R node /usr/src/app
#USER node
#CMD ["node", "servapp.js"]


# ALMOST (except path to package.json) same as in .devcontainer/Dockerfile:

FROM "mcr.microsoft.com/devcontainers/javascript-node:0-18"

WORKDIR /app
# Install dependencies first in order to not rebuild every time code changes.
COPY ./fileserv/package.json /app/fileserv/package.json
RUN npm install ./fileserv

COPY . /app