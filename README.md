# vilin_projekti

## Description
This project (under development) is to contain package managing and
orchestrating logic for WebAssembly-based microservices.

### Features
- Package manager
- Deployment managing
- Device scanning
- RESTful API
- Web GUI

## Installation
Clone the project and its submodules and use `docker compose` to build and start the server.

Using Windows 10 you could do the following:
```powershell
git clone git@github.com:LiquidAI-project/wasmiot-orchestrator.git
cd .\wasmiot-orchestrator\
<# Clone submodule separately in order to work around access issues on Windows. #>
git clone git@github.com:LiquidAI-project/wasmiot-supervisor.git
git submodule init
git submodule update
<#
  NOTE: Be sure to have your MongoDB credentials present in environment
  variables or .env before composing up! Otherwise your MongoDB database is
  created without a "superuser" and you have to re-create it to gain access.
  Here we copy defaults from .env.example.
#>
cp .env.example .env
<# Using the "main" compose file, run the orchestration system. #>
docker compose --profile orchestration up --build
```

### Supervisor (git submodule)
The supervisor is a _git submodule_ so you should clone and work on it
by following the command's documentation:
https://git-scm.com/book/en/v2/Git-Tools-Submodules

__On Windows__ the submodule-related commands like `git submodule update` or
`git pull --recurse-submodule` might complain about unauthorized access. Some
workarounds to these issues are to:
- use `git` from WSL
- clone submodule separately (Based on a [similar situation on Stack
  Overflow](https://stackoverflow.com/questions/60850933/git-submodule-update-permission-denied))

## Usage

### Orchestrator
Orchestrator is a NodeJS server using a MongoDB database.

In order to get them running, first you need to setup a `.env` file for user
credentials. Copy the [`.env.example`](./.env.example) file into your own `.env`
file at the repository root and edit appropriate values to your liking.

__Note__ that if you intend to test the system with devices in the Docker
network, you should __unset__ the `PUBLIC_HOST` environment variable (e.g.
inside `.env` put "`PUBLIC_HOST=`") so that the hosts connecting to orchestrator
use the one automatically obtained from NodeJS.

Running the orchestrator containers can be done with the command:
```
docker compose --profile orchestration up --build
```

Another way is to open the project directory on VSCode and follow these instructions:
1. Right click `docker-compose.yml` on the file explorer
2. Select "Compose Up - Select Services"
3. Select "profiles"
4. Do not select "ABSTRACT_BASE_HACK_DO_NOT_USE"
5. Click "OK"

### Devices
You can test how the orchestrator interacts with the
[supervisor](/wasmiot-supervisor)-controlled devices by running the
containers under profile `device` described in `docker-compose.example.yml`.

All of these pretend-devices can be run at once with the command:
```
docker compose -f ./docker-compose.example.yml --profile device up --build
```

#### Adding new devices to Docker compose
When adding a brand new device to your local Docker compose simulation, you have
to (in addition to entries into the compose file) add a directory for
config-files into this project's [`example`](/example). From here the
config-directories are to be mounted into the devices' containers.

---

### Devcontainer usage

As they both are set to the same Docker network, working simultaneously with
supervisor can be done by running __two__ VSCode instances: first one opened in
the orchestrator's and second one in the supervisor's devcontainer.

#### Debugging
For debugging, the devcontainer should work quite well and you can just use
VSCode like you would locally for debugging JavaScript (using the JavaScript Debug Terminal).

With both the devcontainer and database containers up, the server can be started
from "Run" > "Start Debugging" or pressing F5 on the keyboard.

### Running the orchestrator in a separate environment than the supervisor

This assumes that both the orchestrator and the supervisor are in the same local network and thus can send HTTP requests to each other.

- Create and configure environmental variable file:

    ```bash
    cp .env.example .env
    # edit appropriate values to .env
    ```

- Start the orchestrator:

    ```bash
    docker compose -f docker-compose.vm.yml up --build
    ```
  or
    ```bash
    docker compose -f docker-compose.yml --profile lan up --build
    ```

- The discovery and deployment with a supervisor instance running in a separate device has only been tested when the supervisor has been started locally as a Python application. See the [Supervisor repository](https://github.com/LiquidAI-project/wasmiot-supervisor) for installation instructions.

## Help and known issues
- __Network `wasm-iot` missing__ :
    The docker network `wasmiot-net` should be automatically created when composing up, but can be created manually with the command:
    ```
    docker network create wasmiot-net
    ``` 
- __Project root under `/fileserv` in devcontainer__ :
    In the VSCode devcontainer, the __whole__ project should be visible (e.g., `.vscode` or the `.yml` compose files at the root),
    but sometimes the container opens up inside the subdirectory `/fileserv` with `*.js` etc. files at the root.
    
    Removing old containers and images has seemed to fix this in the past.
***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!).  Thank you to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README
Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers.
