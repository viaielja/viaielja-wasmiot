/**
 * Purely (or close enough) functional (i.e. outputs are based on the inputs
 * only) utilities:
 */
function OpenApi3_1_0_SchemaToInputType(schema) {
    switch (schema.type) {
        case "integer":
            return "number";
        default:
            throw `Unsupported schema type '${schema.type}'`;
    }
}

/**
 * Using HTMLElement.dataset (See:
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dataset),
 * create a Javascript object from the fields i.e.:
 * - text and number -inputs become 'key:string-value' pairs,
 * - select elements' selected options become 'key:string-value' pairs,
 * - 1-dimensional ordered lists become lists of objects (based on the
 * serialized JSON in their items' value-fields). Note: The key that then
 * corresponds to this list in the result object must be found in the
 * HTML-elements field attribute 'data-json-key'!
 */
function formToObject(form) {
    let obj = {};

    let inputs = [
        ...form.querySelectorAll("input[type=text]"),
        ...form.querySelectorAll("input[type=number]"),
    ];
    // Text inputs.
    for (let input of inputs) {
        // HACK: List-inputs are identified by a custom field and
        // ','-characters delimit the values.
        if ("hacktype" in input.dataset && input.dataset.hacktype === "array") {
            obj[input.name] = input.value.split(",").filter(x => x.trim().length > 0);
        } else {
            obj[input.name] = input.value;
        }
    }

    // Select elements immediately under this form NOTE: the ":scope" selector
    // (See: https://developer.mozilla.org/en-US/docs/Web/CSS/:scope) might
    // be better?. HACK: Getting all under div (which currently excludes
    // items under ol).
    for (let select of form.querySelectorAll("div > select")) {
        obj[select.name] = select.selectedOptions[0].value;
    }

    // TODO: Use formdata directly? See:
    // https://developer.mozilla.org/en-US/docs/Web/API/FormData/getAll#examples
    let ol = form.querySelector("ol");
    if (ol !== null && ol) {
        obj[ol.dataset.jsonKey] =
            Array.from(ol.querySelectorAll("select"))
                // Parse the JSON-string hidden inside option.
                .map(x => JSON.parse(x.selectedOptions[0].value));
    }

    return obj;
}

/**
 * Return object representing the data found in a form (files included) for
 * submitting it later with body-parameter in `fetch`. Returns also URL where
 * the form expects to be submitted to.
 * @param {*} form The form to get the data from.
 * @returns FormData object
 */
function formDataFrom(form) {
    let formData = new FormData();

    // Add the data found in the form.
    // NOTE: Only relatively simple forms containing just text
    // inputs and one "level" are handled.
    let formObj = formToObject(form);
    for (let [key, value] of Object.entries(formObj)) {
        switch (typeof (value)) {
            case "string":
                formData.append(key, value);
                break;
            default:
                alert("Submitting the type '" + typeof (value) + "'' is not currently supported!")
                return;
        }
    }

    // NOTE: only one (1) file is sent.
    let fileField = form.querySelector("input[type=file]");
    if (fileField) {
        formData.append(fileField.name, fileField.files[0]);
    }

    return formData;
}

/**
 * Return list of options for the sequence-item.
 * @param {*} devicesData [{_id: string, name: string} ..}]
 * @param {*} modulesData [{_id: string, name: string, exports: [{name: string, } ..]} ..]
 * @returns [{value: string, text: string} ..]
 */
function sequenceItemSelectOptions(devicesData, modulesData) {
    let options = [
        // Add placeholder first.
        { value: "", text: "Please select the next procedure:" },
    ];

    // The null here means that selecting the device is left for orchestrator to decide.
    let anyDevice = { _id: null, name: "any device" };

    // Add all the different procedures (i.e., module exports) to be
    // selectable.
    for (let device of [anyDevice].concat(devicesData)) {
        for (let mod of modulesData) {
            if (mod.exports === undefined) {
                // Do not include modules without uploaded Wasm's at all.
                continue;
            }
            for (let exportt of mod.exports) {
                options.push({
                    // Add data to the option element for parsing later and
                    // sending to the deploy-endpoint.
                    value: JSON.stringify({ "device": device._id, "module": mod._id, "func": exportt.name }),
                    // Make something that a human could understand from the interface.
                    // TODO/FIXME?: XSS galore?
                    text: `Use ${device.name} for ${mod.name}:${exportt.name}`
                })
            }
        }
    }

    return options;
}

/*******************************************************************************
 * Utilities for updating elements on the page:
 */

async function tryFetchWithStatusUpdate(path) {
    let resp;
    let json;
    try {
        resp = await fetch(path);
        json = await resp.json();
    } catch (error) {
        setStatus({ error: error });
        throw error;
    }

    if (resp.ok) {
        return json;
    } else if (json) {
        if (!json.error) {
            json.error = "error field missing";
        }
        setStatus(json);
        throw json;
    } else {
        let error = { error: f`fetch to '${path}' failed ${resp.status}` };
        setStatus(error);
        throw error;
    }
}

function generateParameterFieldsFor(deployment) {
    // Get the data to build a form.
    let { operationObj: operation } = getStartEndpoint(deployment);

    let fieldDivs = [];
    // Build the form.
    for (let param of operation.parameters) {
        // Create elems.
        let inputFieldDiv = document.createElement("div");
        let inputFieldLabel = document.createElement("label");
        let inputField = document.createElement("input");

        // Fill with data.
        inputFieldLabel.textContent = param.description
        inputField.type = OpenApi3_1_0_SchemaToInputType(param.schema);
        inputField.name = param.name;

        // Add to form.
        inputFieldLabel.appendChild(inputField);
        inputFieldDiv.appendChild(inputFieldLabel);

        fieldDivs.push(inputFieldDiv);
    }

    // (Single) File upload based on media type.
    if (operation.requestBody) {
        let [fileMediaType, _fileSchema] = Object.entries(operation.requestBody.content)[0];
        let fileInputDiv = document.createElement("div");
        let fileInputFieldLabel = document.createElement("label");
        let fileInputField = document.createElement("input");
        // Data.
        let executeFileFieldName = "inputFile";
        let executeFileUploadId = `execute-form-${fileMediaType}-${executeFileFieldName}`;
        fileInputFieldLabel.textContent = `Upload file (${fileMediaType}):`;
        fileInputFieldLabel.htmlFor = executeFileUploadId;
        fileInputField.id = executeFileUploadId;
        fileInputField.name = executeFileFieldName;
        fileInputField.type = "file";
        // Add to form.
        fileInputDiv.appendChild(fileInputFieldLabel);
        fileInputDiv.appendChild(fileInputField);

        fieldDivs.push(fileInputDiv);
    }

    return fieldDivs;
}

function addProcedureRow(listId, devicesData, modulesData) {
    /**
     * Constructor for the following HTML:
     * <li id="dprocedure-select-list-0">
     *   <label for="dprocedure-select-0">Select a procedure:</label>
     *   <select id="dprocedure-select-0" name="proc0" required>
     *     <option value="">
     *       Please select the next procedure:
     *     </option>
     *     <option value="{'device':<did0>,'module':<mid0>,'func':<fname0>}">
     *      [dName] [mName] [fName]
     *     </option>
     *     ...
     *   </select>
     * </li>
     */
    async function makeItem(id) {
        let select = document.createElement("select");
        select.id = `dprocedure-select-${id}`;
        select.name = `proc${id}`;
        select.required = true;
        let options = sequenceItemSelectOptions(devicesData, modulesData);
        fillSelectWith(options, select, true);

        let label = document.createElement("label");
        label.for = select.id;
        label.textContent = "Select a procedure:";

        let li = document.createElement("li");
        li.id = `dprocedure-select-list-${id}`;
        li.appendChild(label);
        li.appendChild(select);
        return li;
    }

    /**
     * Add a new row to the list-element with id `listId`.
     */
    async function handleAddRow(event) {
        event.preventDefault();

        let parentList = document.querySelector(`#${listId}`);
        let nextId = parentList.querySelectorAll("li").length;
        let newListItem = await makeItem(nextId);
        parentList.appendChild(newListItem);
    }

    return handleAddRow;
}

/**
 * Return a handler that submits JSON contained in a textarea-element of the
 * event target to the url.
 */
function submitJsonTextarea(url, successCallback) {
    function handleSubmit(formSubmitEvent) {
        formSubmitEvent.preventDefault();
        let json = formSubmitEvent.target.querySelector("textarea").value;

        // Disable the form for the duration of the submission (provided it is
        // inside a fieldset-element).
        formSubmitEvent.target.querySelector("fieldset").disabled = true;
        // Submit to backend that handles application/json.
        fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: json
        })
            // TODO The backend should preferrably always respond with JSON but
            // does not currently always do so...
            .then(function (response) { return response.json(); })
            .then(function (result) {
                if (result.success) {
                    // Re-enable the form and show success message
                    formSubmitEvent.target.querySelector("fieldset").disabled = false;
                    if (successCallback) { successCallback(result) };
                }
                setStatus(result);
            })
            .catch(function (result) {
                // Show an error message.
                setStatus(result);
            });
    }
    return handleSubmit;
}

/**
 * Return a handler that submits (POST) a form with the
 * 'enctype="multipart/form-data"' to the url. Used for uploading files
 * along with other fields of the form in the body.
 *
 * See:
 * https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#uploading_a_file
 */
function submitFile(url) {
    function handleSubmit(formSubmitEvent) {
        formSubmitEvent.preventDefault()
        let formData = formDataFrom(formSubmitEvent.target);
        // NOTE: Semi-hardcoded route parameter! Used e.g. in '/file/module/:id/upload'.
        let idUrl = url.replace(":id", formData.get("id"));

        fetch(idUrl, { method: "POST", body: formData })
            .then((resp) => resp.json())
            .then(result => {
                setStatus(result);
            })
            // TODO: This never happens with fetch(), does it? (unless explicitly
            // coded throwing an error).
            .catch(result => {
                setStatus(result)
            });
    }

    return handleSubmit;
}

/**
 * Transform the sourceForm's contents into JSON and put into the
 * targetTextArea.
 */
function populateWithJson(sourceForm, targetTextArea) {
    targetTextArea.value = JSON.stringify(formToObject(sourceForm), null, 2);
}

/**
 * Clear the current options in the select-element and add new ones using the
 * given list of `value` and `text` fields.
 * @param {*} valueAndTextData List of objects with `value` and `text` fields.
 * @param {*} selectElem The `select` element to populate with options.
 */
function fillSelectWith(valueAndTextData, selectElem, removePlaceholder=false) {
    // Remove previous ones first and replace with newly fetched ones.
    for (let option of selectElem.querySelectorAll("option")) {
        if (option.value !== "" || removePlaceholder) {
            option.remove();
        }
    }

    for (let x of valueAndTextData) {
        let optionElem = document.createElement("option");
        optionElem.value = x.value;
        optionElem.textContent = x.text;
        selectElem.appendChild(optionElem);
    }
}

/**
 * Set the status bar to signify different states described by key-value pair in
 * the `result` parameter.
 * @param {} result `null` to reset the element or an Object containing one of
 * the keys `error`, `success`, `result` with message as the value.
 */
function setStatus(result) {
    let focusBar = document.querySelector("#status");
    focusBar.classList.remove("error");
    focusBar.classList.remove("success");
    // "Result" is the result of execution e.g. `plus(1, 2)` results in `3`.
    focusBar.classList.remove("result");
    focusBar.classList.remove("hidden");

    if (result === null) {
        // Reset the status.
        focusBar.classList.add("hidden");
        return;
    }

    if (result.error) {
        // Empty the message if result is malformed.
        msg = result.errorText ?? ("RESPONSE MISSING FIELD `error`: " + JSON.stringify(result));
        // Default the style to error.
        classs = "error"
    } else {
        msg = JSON.stringify(result);
        classs = "success";
    }
    focusBar.textContent = msg;
    focusBar.classList.add(classs);
    // Scroll into view.
    focusBar.focus();
}

/*******************************************************************************
 * Tabs:
 */

/**
 * Mapping of tab-ids to functions to fetch the needed data for the tab and then
 * set up the tab's elements.
 *
 * Used so that each tab runs its own setup-function whenever it is selected.
 */
function setupTab(tabId) {
    const tabSetups = {
        "resource-listing"  : setupResourceListingTab,
        "module-create"     : setupModuleCreateTab,
        "module-upload"     : setupModuleUploadTab,
        "deployment-create" : setupDeploymentCreateTab,
        "deployment-action" : setupDeploymentActionTab,
        "execution-start"   : setupExecutionStartTab,
    };

    tabSetups[tabId]();
}

/** Return suffix for URL used in GETting a resource or many. */
const idSuffix = (id) => id ? ("/" + id) : "";
/** Fetch specific device if given ID, otherwise all of them. */
const fetchDevice     = async (id) => fetch(`/file/device${idSuffix(id)}`).then(resp => resp.json());
/** Fetch specific module if given ID, otherwise all of them. */
const fetchModule     = async (id) => fetch(`/file/module${idSuffix(id)}`).then(resp => resp.json());
/** Fetch specific deployment if given ID, otherwise all of them. */
const fetchDeployment = async (id) => fetch(`/file/manifest${idSuffix(id)}`).then(resp => resp.json());

/**
 * Needs data about:
 * - All devices
 * - All modules
 * - All deployments
 */
async function setupResourceListingTab() {
    const devices = await fetchDevice();
    const modules = await fetchModule();
    const deployments = await fetchDeployment();

    // TODO: Make a nice listing of the resources.
}

/**
 * Needs no data.
 */
async function setupModuleCreateTab() {
    // NOTE: This is here just for the sake of consistency.
}

/**
 * Update the form that is used to upload a Wasm-binary with the current
 * selection of modules recorded in database.
 *
 * Needs data about:
 * - All modules
 */
async function setupModuleUploadTab() {
    const modules = await fetchModule();

    let selectElem = document.querySelector("#wmodule-select");

    // Remove previous ones first and replace with newly fetched ones.
    for (let option of selectElem.querySelectorAll("option")) {
        if (option.value !== "") {
            option.remove();
        }
    }

    for (let mod of modules) {
        let optionElem = document.createElement("option");
        optionElem.value = mod._id;
        optionElem.textContent = mod.name;
        selectElem.appendChild(optionElem);
    }
}

/**
 * Needs data about:
 * - All devices
 * - All modules
 */
async function setupDeploymentCreateTab() {
    const devices = await fetchDevice();
    const modules = await fetchModule();

    // (re)Add the button for adding new procedure rows.
    const nextRowButtonId = "dadd-procedure-row";
    document.querySelector(`#${nextRowButtonId}`)?.remove();
    let nextButton = document.createElement("button");
    nextButton.id = nextRowButtonId;
    nextButton.textContent = "Next";
    nextButton
        .addEventListener(
            "click",
            // NOTE: This means that the data is queried only once when opening
            // this tab and new rows won't have the most up-to-date data.
            addProcedureRow("dprocedure-sequence-list", devices, modules)
        );

    // Add the button under the list in the same div.
    document
        .querySelector("#dprocedure-sequence-list")
        .parentElement
        .appendChild(nextButton);

    // If there is any existing procedure rows, update them as well.
    for (let select of document.querySelectorAll("#dprocedure-sequence-list select")) {
        fillSelectWith(sequenceItemSelectOptions(devices, modules), select, true);
    }
}

/**
 * Needs data about:
 * - All deployments
 */
async function setupDeploymentActionTab() {
    const deployments = await fetchDeployment();

    fillSelectWith(
        deployments.map((x) => ({ value: x._id, text: x.name })),
        document.querySelector("#dmanifest-select")
    );
}

/**
 * Needs data about:
 * - All deployments
 */
async function setupExecutionStartTab() {
    const deployments = await fetchDeployment();

    fillSelectWith(
        deployments.map((x) => ({ value: x._id, text: x.name })),
        document.querySelector("#edeployment-select")
    );

    /**
     * Using the deployment-ID in the event, generate a form for submitting
     * inputs that start the deployment.
     * @param {*} event The event that triggered this function.
     */
    async function setupParameterFields(event) {
        // Remove all other elements from the form except for the deployment
        // selector.
        let divsWithoutFirst =
            document.querySelectorAll("#execution-form fieldset > div > div:not(:first-child)");
        for (div of divsWithoutFirst) {
            div.remove();
        }

        // Add new fields based on the selected deployment.
        let deploymentId = event.target.value;
        let deployment = await fetchDeployment(deploymentId);

        let formTopDiv = document.querySelector("#execution-form fieldset > div");
        for (let div of generateParameterFieldsFor(deployment)) {
            formTopDiv.appendChild(div);
        }
    }

    // Now that the selection is populated, add an event handler for selecting
    // each.
    for (let option of document.querySelectorAll("#edeployment-select option")) {
        option.addEventListener("click", setupParameterFields);
    }
}

/*******************************************************************************
 * Event listeners:
 */

function handleExecutionSubmit(event) {
    submitFile("/execute/:id")(event);
}


/*******************************************************************************
 * Page initializations:
 */

/**
 * Add event handlers for showing and hiding different tabs.
 */
async function addHandlersToTabSelectors() {
    // Open up the currently selected tab.
    let selectedTab = document.querySelector('#selector input[name="tab-selector"]:checked')
        || document.querySelector('#selector input[name="tab-selector"]');
    let selectedTabId = selectedTab.dataset.tabId;
    let initialTabToShow = document.getElementById(selectedTabId);
    initialTabToShow.classList.remove("hidden");
    initialTabToShow.classList.add("selected");
    // Also ensure the matching radiobutton is always checked.
    selectedTab.checked = true;
    // Perform the initial setup of the tab.
    setupTab(selectedTabId);

    // Add event handlers for showing and hiding different tabs.
    let tabElems = document.querySelectorAll("#selector input");
    for (let elem of tabElems) {
        elem.addEventListener("input", function (event) {
            const targetTabId = event.target.dataset.tabId;
            // Call this tab's initialization function.
            setupTab(targetTabId)

            // Hide previous tab.
            let previousTab = document.querySelector("#tab-container > .selected");
            previousTab.classList.remove("selected");
            previousTab.classList.add("hidden");

            // Show the selected tab.
            let tabToShow = document.getElementById(targetTabId);
            tabToShow.classList.remove("hidden");
            tabToShow.classList.add("selected");
        });
    }
}

/**
 * Add event handlers for the forms creating or updating a module.
 */
function addHandlersToModuleForms() {
    // Swap the form's view from human-friendly to the JSON textarea. TODO: This
    // is a bit boilerplatey because repeated with deployment forms.
    document.querySelector("#module-form")
        // NOTE: Submit event here in order to have form make requirement-checks
        // automatically.
        .addEventListener("submit", function (event) {
            event.preventDefault();
            // Also populate the JSON field.
            let thisForm = document.querySelector("#module-form")
            let jsonForm = document.querySelector("#module-json-form");
            let jsonFormTextarea = jsonForm.querySelector("textarea");
            populateWithJson(thisForm, jsonFormTextarea);

            // Merge the OpenAPI field into the JSON. TODO: This is clunky...
            let moduleObj = JSON.parse(jsonFormTextarea.value)
            try {
                setStatus(null);
                moduleObj["openapi"] = JSON.parse(thisForm.querySelector("#mopenapi").value);
            } catch (e) {
                setStatus({error: `Check for 'TODO' in your OpenAPI description: ${e}`});
                return;
            }

            jsonFormTextarea.value = JSON.stringify(moduleObj);

            thisForm.classList.add("hidden");
            jsonForm.classList.remove("hidden");
        });
    // Same as above but reverse and does not fill in the form (TODO).
    document.querySelector("#module-json-form .input-view-switch")
        .addEventListener("click", function (_) {
            document.querySelector("#module-json-form").classList.add("hidden");
            document.querySelector("#module-form").classList.remove("hidden");
        });

    document
        .querySelector("#module-json-form")
        .addEventListener("submit", submitJsonTextarea("/file/module"));

    document.querySelector("#wasm-form").addEventListener("submit", submitFile("/file/module/:id/upload"));
}

/**
 * Add event handlers for the forms creating or sending a deployment.
 */
function addHandlersToDeploymentForms() {
    // Swap the form's view from human-friendly to the JSON textarea.
    document.querySelector("#deployment-form")
        .addEventListener("submit", function (event) {
            event.preventDefault();
            // Also populate the JSON field.
            let thisForm = document.querySelector("#deployment-form")
            let jsonForm = document.querySelector("#deployment-json-form");
            populateWithJson(thisForm, jsonForm.querySelector("textarea"));

            thisForm.classList.add("hidden");
            jsonForm.classList.remove("hidden");
        });
    // Same as above but reverse and does not fill in the form (TODO).
    document.querySelector("#deployment-json-form .input-view-switch")
        .addEventListener("click", function (_) {
            document.querySelector("#deployment-json-form").classList.add("hidden");
            document.querySelector("#deployment-form").classList.remove("hidden");
        });

    // POST the JSON found in textarea to the server.
    document
        .querySelector("#deployment-json-form")
        .addEventListener("submit", submitJsonTextarea("/file/manifest"));

    document
        .querySelector("#deployment-action-form")
        .addEventListener(
            "submit",
            (event) => {
                event.preventDefault();
                let deploymentObj = formToObject(event.target);
                fetch(`/file/manifest/${deploymentObj.id}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(deploymentObj)
                })
                    .then(resp => resp.json())
                    .then(setStatus)
                    .catch(setStatus);
            }
        );
}

/**
 * Add event handlers for the forms executing a deployment.
 */
function addHandlersToExecutionForms() {
    document
        .querySelector("#execution-form")
        .addEventListener("submit", handleExecutionSubmit);
}

/**
 * Add event handlers for the buttons performing simple READ or DELETE
 * operations on resources.
 */
function addHandlersToResourceListings() {
    document.querySelector("#module-deleteall-form").addEventListener("submit", (event) => {
        event.preventDefault();
        fetch("/file/module", { method: "DELETE" })
            .then(resp => resp.json())
            .then(setStatus);
    });

    document.querySelector("#device-deleteall-form").addEventListener("submit", (event) => {
        event.preventDefault();
        fetch("/file/device", { method: "DELETE" })
            .then(resp => resp.json())
            .then(setStatus);
    });

    document.querySelector("#manifest-deleteall-form").addEventListener("submit", (event) => {
        event.preventDefault();
        fetch("/file/manifest", { method: "DELETE" })
            .then(resp => resp.json())
            .then(setStatus);
    });

    // Device discovery:
    document.querySelector("#device-discovery-reset-form").addEventListener("submit", (event) => {
        event.preventDefault();
        fetch("/file/device/discovery/reset",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // Send nothing.
                body: "{}",
            })
            .then(resp => resp.json())
            .then(setStatus);
    });
}

/*******************************************************************************
 * Main:
 */

window.onload = function () {
    addHandlersToTabSelectors();
    addHandlersToResourceListings();
    addHandlersToModuleForms();
    addHandlersToDeploymentForms();
    addHandlersToExecutionForms();
};
