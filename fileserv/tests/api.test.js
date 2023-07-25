/**
 * Testing the orchestrator server's ReSTful API.
 */

const supertest = require('supertest');

const { app } = require('../server');
const PRIMITIVE_MODULE_DESCRIPTION = require("./testData/moduleDescription/primitive");


const PRIMITIVE_MODULE_PATH = `${__dirname}/testData/wasm/wasm32-unknown-unknown/primitive.wasm`;

const orchestratorApi = supertest(app);


describe("module", () => {
  test("creation success", async () => {
    await orchestratorApi
      .post("/file/module")
      .send({
        name: "foo",
        openapi: {
          bar: "baz"
        }
      })
      .expect(201);

    let moduleListResponse = await orchestratorApi
      .get("/file/module/")
      .expect(200)
      .expect("Content-Type", /application\/json/);
    
    expect(moduleListResponse.body).toHaveLength(1);
    expect(moduleListResponse.body[0]["name"]).toEqual("foo");
    expect(moduleListResponse.body[0]["openapi"]).toEqual({ bar: "baz" });
  });
});

describe("end to end", () => {
  test("creation, deployment and execution of an 'increment' function-module succeeds", async () => {
    let moduleCreationResult = await orchestratorApi
        .post("/file/module")
        .send(PRIMITIVE_MODULE_DESCRIPTION)
        .expect(201);
        // TODO: Test that response has the id in JSON.
    
    let createdModuleId = moduleCreationResult.body["success"]
      .substring(moduleCreationResult.body["success"].lastIndexOf(":") + 1)
      .trim();
    
    let wasmUploadResponse = await orchestratorApi
      .post("/file/module/upload")
      .field("id", createdModuleId)
      .attach("module", PRIMITIVE_MODULE_PATH)
      .expect(200);

    expect(wasmUploadResponse.body).toHaveProperty("wasm");
    expect(wasmUploadResponse.body["type"]).toEqual("wasm");
    expect(wasmUploadResponse.body).toHaveProperty("exports");
    expect(wasmUploadResponse.body["exports"].length).toBeGreaterThan(0);
    expect(wasmUploadResponse.body["exports"][0])
        .toEqual([{"name": "add1", "parameters": ["i64"], "output": "i64"}]);

    // TODO: The rest of the test (deployment and execution with a fake device (use `jest.fn()`?)).
    console.error("!!! NOTE: This test is currently unfinished !!!");
  });
});