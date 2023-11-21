# Modules

WebAssembly binaries or "modules" are submitted through the orchestrator API
in order for the orchestrator to generate descriptions off of them that can be
used in deployment actions.

The submission process currently has two parts but this could very well be changed into
just a single `POST` request. The two parts are 1. creating the module resource
and 2. describing how to interact with exports of the module.

## Creating a module
When creating a module, you submit its name for yourself to identify later and
along it a `.wasm` file. The `.wasm` file is parsed at the server and its
imports and exports are extracted, __dealing only__ with the simple WebAssembly
primitives.

## Describing a module
The request format that the API expects in describing a module is of the
`multipart/form-data` media-type in order to upload multiple data-files along
with key-value type descriptions. Data-files are turned into "mounts", by
using their names as "paths", that are eventually used when supervisor sets up
the filesystem environment for deployment. Mounts have "stages" (deployment,
execution and output), for when they are expected to be available at the module
i.e., if you deploy without sending along a "deployment" data-file, the
deployment should fail then and there.

## Module metadata
There are quite a bit of fields that the orchestrator needs for modules, as
they are at the center of the system. TODO

### Imports
A module's imports are things that (in the current setup) the supervisor
provides to the module when it is needed to run. Names of these imports (which
are effectively just functions) match what supervisors advertise as their
"skills" (`wasmiot-device-description`) during their [discovery](docs/discovery.md). Nothing else but the names
are known or checked about the imports.

### Exports
Exports are again, functions, that the module exposes for the supervisor and
WebAssembly runtime to execute. These functions are mapped into HTTP-endpoints
based on function names and some basic information. The latter "basic information"
are things like parameter and output types and which files or "mounts" with
what names the function expects when it runs. The orchestrator server generates 
a "standard format" description, more precisely an OpenAPI v3.0 document about
the endpoints so that compatible tooling (e.g. client/server-generation,
documentation, tests?) could potentially be utilized when interacting with and/or making sense of the
system. You'll see the concept of "endpoint" being thrown around the
module-related implementation, so remember that it represents the way
communication between WebAssembly functions is translated over HTTP.
