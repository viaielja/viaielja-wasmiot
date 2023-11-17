# Request orchestrator to deploy work according to the deployment created
# earlier identified by DEPLOYMENT_ID argument.
DEPLOYMENT_ID=$1
curl -X POST http://localhost:3000/file/manifest/${DEPLOYMENT_ID} --header "Content-Type: application/json"
