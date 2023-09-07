# Wasm-IoT Orchestrator

## Tabs
- Resources: List different resources available for the orchestrator
- Module creation: Create a module resource
- Module upload: Upload files (such as `.wasm` or `.pb`) to attach to a previously created module resource
- Deployment manifest creation: Create a deployment resource
- Deployment of deployment manifests: Send deployment request to devices for setting themselves up
- Execution: Start a work previously deployed

## Examples

### Device
For this you should have a supervisor running and available for the orchestrator
to communicate with. Here we will be using the name "mydevice".

### Running `fibo` function

#### Module
Create a module resource let's say with the name "Fibo" and pasting the
[description](https://github.com/LiquidAI-project/wasmiot-modules/blob/main/modules/fibo/open-api-description.json)
to the other provided text area. Then hit "Convert to JSON" and "Submit".

Next you need to upload and attach the actual [Fibonacci WebAssembly
-module](https://github.com/LiquidAI-project/wasmiot-modules/tree/main/modules/fibo)
to your created module resource. Select "Fibo" from the dropdown, upload you
`.wasm` and hit "Submit".

#### Deployment
Create a deployment resource let's say with the name "fibo-dep" and with the
button labeled "Next", add and select a single entry to the sequence labelled
"Use mydevice for Fibo:fibo". The last bit in the entry means
`<module>:<function>`. Hit "Convert to JSON" and "Submit" the form.

Deploy the  deployment manifest for "fibo-dep" making the related device set
itself up.

#### Execution
Run the deployed "fibo-dep" providing it with an argument and hitting the button labeled "Execute".

When the request returns, the top of the page should contain the result.

### Running ML inference

NOTE: "mydevice" should have camera and WASI-interfaces available for this
deployment to work! __Running the device on Linux and without Docker is
therefore most likely to work without further configuration.__

#### Module
We need two modules for this: ["Camera"](https://github.com/LiquidAI-project/wasmiot-modules/tree/main/modules/camera) and "Inference".
Create and upload "Camera" just like with "Fibo".

The "Inference" module is a bit different.
Compatible module description for inference is provided in [here](https://github.com/LiquidAI-project/wasmiot-modules/blob/main/modules/object-inference-open-api-description.json).
The change is that for this module you need to also attach the `.pb` file to
your ML-module as well as the `.wasm`. Both types of files can be uploaded using the same form.
The `.wasm` and `.pb` files can be found in [here](https://github.com/radu-matei/wasi-tensorflow-inference/tree/master/model).

#### Deployment
Create a deployment "ml-dep" with two entries this time. First entry should take an image with camera attached to "mydevice" and next infer the result from that image using ML. The sequence should then be:
1. `Camera:take_image`
2. `Inference:infer_from_ptrs`

Remember to deploy this to related device as well.

#### Execution
Now you can request inference from the "Execution" tab by selecting "ml-dep" from
the dropdown and clicking "Execute". There are no arguments this time. The
classification should again be returned to the top of the page once the request
returns. You can check the classification of your camera-capture by matching the
number returned with line numbers in [the
labels](https://github.com/radu-matei/wasi-tensorflow-inference/blob/master/model/labels.txt).