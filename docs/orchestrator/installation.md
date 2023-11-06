# Orchestrator installation
Clone the project and use `docker compose` (which uses `docker-compose.yml` by default) to build and start the server and database containers.

## Quickstart
```
git clone git@github.com:LiquidAI-project/wasmiot-orchestrator.git
cd ./wasmiot-orchestrator/
cp .env.example .env
docker compose up --build
```

Orchestrator Web-GUI should then be available at [`http://localhost:3000`](http://localhost:3000).

## Database
Before first startup, you need to have set your preferred database credentials with which the container initializes itself. See the "Environment Variables" section on [the image's dockerhub page](https://hub.docker.com/_/mongo)

## Orchestrator
Once you've set the database variables (in environment or an `.env` file at project root), you're ready to start all the things.

See the provided `.env.example` file for other possible customizations.
