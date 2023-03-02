# Example setup for demonstration
Using the `docker-compose.example.yml` file, the orchestrator and a bunch of
example devices can be started.

The devices get their configurations from the files under subdirectories
`device*`, which will be mounted to their matching containers.

## Thing description for Wasm-IoT
### Notable definitions
- [_Forms_](https://www.w3.org/TR/wot-thing-description11/#form) (mandatory on all _InteractionAffordances_)