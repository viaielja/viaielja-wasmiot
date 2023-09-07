/**
 * Testing the orchestrator server's ReSTful API.
 */

const supertest = require('supertest');

const app = require('../server');
const PRIMITIVE_MODULE_DESCRIPTION = require("./testData/moduleDescription/primitive");


const PRIMITIVE_MODULE_PATH = `${__dirname}/testData/wasm/wasm32-unknown-unknown/primitive.wasm`;

const orchestratorApi = supertest(app);


describe("module", () => {
  test("creation success", async () => {
    let moduleCreationResponse = await orchestratorApi
      .post("/file/module")
      .send({
        name: "a",
        openapi: {}
      })
      .expect(201)
      .expect("Content-Type", /application\/json/);

    expect(moduleCreationResponse.body).toHaveProperty("id");
  });

  test("listing success", async () => {
    await orchestratorApi
        .post("/file/module")
        .send({name: "b", openapi: {}});

    await orchestratorApi
        .post("/file/module")
        .send({name: "c", openapi: {}});

    let moduleListResponse = await orchestratorApi
      .get("/file/module/")
      .expect(200)
      .expect("Content-Type", /application\/json/);

    // NOTE: Not testing exact length, because it would require resetting app
    // (database) state (on top of reliably running tests sequentially).
    expect(moduleListResponse.body).toHaveProperty("length");
    expect(moduleListResponse.body.length).toBeGreaterThan(1);
  });

  test("fetched by ID", async () => {
    let dId = (await orchestratorApi
        .post("/file/module")
        .send({name: "d", openapi: {}})
      ).body["id"];

    let dGetResponse = await orchestratorApi.get(`/file/module/${dId}`)
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(dGetResponse.body).toHaveProperty("length");
    expect(dGetResponse.body.length).toBe(1);
    expect(dGetResponse.body[0]).toHaveProperty("name");
    expect(dGetResponse.body[0]["name"]).toEqual("d");
    expect(dGetResponse.body[0]).toHaveProperty("openapi");
    expect(dGetResponse.body[0]["openapi"]).toEqual({});
  });

  test("identified by ID", async () => {
    let eId = (await orchestratorApi
        .post("/file/module")
        .send({name: "e", openapi: {}})
      ).body["id"];

    let fId = (await orchestratorApi
        .post("/file/module")
        .send({name: "f", openapi: {}})
      ).body["id"];


    let eGetResponse = await orchestratorApi.get(`/file/module/${eId}`);
    expect(eGetResponse.body[0]["name"]).toEqual("e");

    let fGetResponse = await orchestratorApi.get(`/file/module/${fId}`);
    expect(fGetResponse.body[0]["name"]).toEqual("f");
  });

  test("wasm upload success", async () => {
    let primitiveId = (await orchestratorApi
        .post("/file/module")
        .send(PRIMITIVE_MODULE_DESCRIPTION)
      ).body["id"];

    let wasmUploadResponse = await orchestratorApi
      // TODO: PUT or PATCH would be ReSTfuller...
      .post(`/file/module/${primitiveId}/upload`)
      .attach("module", PRIMITIVE_MODULE_PATH)
      .expect(200);

    expect(wasmUploadResponse.body).toHaveProperty("type");
    expect(wasmUploadResponse.body["type"]).toEqual("wasm");
    expect(wasmUploadResponse.body).toHaveProperty("exports");

    let exports = wasmUploadResponse.body["exports"];
    expect(exports).toHaveProperty("length");
    expect(exports.length).toBeGreaterThan(0);
    expect(exports[0])
        .toEqual({ "name": "add1", "parameterCount": 1 });
  });

  test("individual deletion success", async () => {
    let gId = (await orchestratorApi
        .post("/file/module")
        .send({
          name: "g",
          openapi: {}
        })
      ).body["id"];

    await orchestratorApi.get(`/file/module/${gId}`).expect(200);

    await orchestratorApi.delete(`/file/module/${gId}`).expect(204);

    await orchestratorApi.get(`/file/module/${gId}`).expect(404);
  });

  test("full deletion success", async () => {
    await orchestratorApi
        .post("/file/module")
        .send({
          name: "h",
          openapi: {}
        });

    let moduleListResponse = await orchestratorApi.get("/file/module/");
    expect(moduleListResponse.body.length).toBeGreaterThan(0);

    let moduleDeleteResponse = await orchestratorApi.delete(`/file/module/`)
      .expect(200);

    // NOTE: Not testing for exact match or if anything can fetched after full
    // deletion, because of test synchronization ambiguity.
    expect(moduleDeleteResponse.body).toHaveProperty("deletedCount");
    expect(moduleDeleteResponse.body["deletedCount"]).toBeGreaterThan(0);
  });
});


describe("deployment", () => {
  test("simple sequence creation success", async () => {
    let { deviceId, moduleId } = await prepareSimpleDeploymentTest();

    let deploymentCreationResponse = await expectApiCreateSimpleSequenceDeployment(deviceId, moduleId, { name: "a" });

    expect(deploymentCreationResponse.body).toHaveProperty("id");
    // TODO: Could check the "manifest" created by the orchestrator, but the
    // format is probably frequently changing.
  });

  test.only("listing success", async () => {
    let { deviceId, moduleId } = await prepareSimpleDeploymentTest();
    await expectApiCreateSimpleSequenceDeployment(deviceId, moduleId, { name: "b" });
    await expectApiCreateSimpleSequenceDeployment(deviceId, moduleId, { name: "c" });

    let deploymentListResponse = await orchestratorApi
      .get("/file/manifest")
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(deploymentListResponse.body).toHaveProperty("length");
    expect(deploymentListResponse.body.length).toBeGreaterThan(1);
  });

  test("fetched by ID", async () => {
    let { deviceId, moduleId } = await prepareSimpleDeploymentTest();
    let dId = (await expectApiCreateSimpleSequenceDeployment(deviceId, moduleId, { name: "d" })).body["id"];

    let dGetResponse = await orchestratorApi.get(`/file/manifest/${dId}`)
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(dGetResponse.body).toHaveProperty("name");
    expect(dGetResponse.body["name"]).toEqual("d");
  });

  test("simple sequence deployment success", async () => {
    let { deviceId, moduleId } = await prepareSimpleDeploymentTest();
    let dId = (await expectApiCreateSimpleSequenceDeployment(deviceId, moduleId, { name: "e" })).body["id"];

    let deploymentResponse = await orchestratorApi
      .post(`/file/manifest/${dId}`)
      .expect(200)
      .expect("Content-Type", /application\/json/);

    expect(deploymentResponse.body).toHaveProperty("deviceResponses");
    expect(deploymentResponse.body["deviceResponses"]).toHaveProperty(deviceId);
    // NOTE: Accurately testing what the devices answer should be supervisor's
    // responsibility. Orchestrator should then just be adapted to what ever the
    // format is.
  });
});

/* Get (and check) the id of the test device */
async function getTestDeviceId() {
  return (await orchestratorApi.get("/file/device")
      .expect(200)
      ).body[0]["_id"];
}

/* @returns Created module ID */
async function expectApiCreatePrimitiveModule() {
    // Create and upload a deployable module.
    let moduleId = (await orchestratorApi
      .post("/file/module")
      .send(PRIMITIVE_MODULE_DESCRIPTION)
      .expect(201)
      ).body["id"];

    await orchestratorApi
      // TODO: PUT or PATCH would be ReSTfuller...
      .post(`/file/module/${moduleId}/upload`)
      .attach("module", PRIMITIVE_MODULE_PATH)
      .expect(200);

    return moduleId;
}

/* @returns Created deployment response */
async function expectApiCreateSimpleSequenceDeployment(deviceId, moduleId, options) {
    return await orchestratorApi
      .post("/file/manifest")
      .send({
        name: options?.["name"] || "testDeploymentName",
        sequence: [
          {
            device: deviceId,
            module: moduleId,
            func: "add1",
          }
        ]
      })
      .expect(201)
      .expect("Content-Type", /application\/json/);
}

async function prepareSimpleDeploymentTest() {
    let deviceId = await getTestDeviceId();
    let moduleId = await expectApiCreatePrimitiveModule();
    return { deviceId, moduleId };
}