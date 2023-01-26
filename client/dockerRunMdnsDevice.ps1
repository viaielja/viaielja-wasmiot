# HOWTO: 1. cat this script 2. copy the output 3. paste the script to shell 4. praise windows
#
# Example of adding a new container running the mdnsDevice-image (thus playing
# as a totally new IoT-device) to the same network as the orchestrator is in
# (the latter done with docker compose).
docker run `
<# Make port accessible (from) host:container (to) #> `
-p 3003:3003 `
<# Specify the Docker-made network to connect to. #> `
--network wasmiot-orchestrator_default `
<# Specify name of this device inside the network (i.e., accessible from URL
<hostname>:<port>/<resource>) #> `
--hostname my-second-device `
<# The image to run. #> `
wasmiot-orchestrator-device-random-num-gen-100:latest `
<# Command to execute inside the container (starts the device with HTTP
endpoint available on port 3003 and 250 as a identifier for the service) #> `
nodejs mdnsDevice.js 3003 250
