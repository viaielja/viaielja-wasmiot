# Create a deployment entry at the orchestrator.
curl -X POST http://localhost:3000/file/manifest --header "Content-Type: application/json" --data "@./manifest.json"
