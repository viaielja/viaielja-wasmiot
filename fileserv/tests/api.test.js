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
    // (database) state on top of reliably running tests sequentially.
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

    expect(dGetResponse.body).toHaveProperty("name");
    expect(dGetResponse.body["name"]).toEqual("d");
    expect(dGetResponse.body).toHaveProperty("openapi");
    expect(dGetResponse.body["openapi"]).toEqual({});
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
    expect(eGetResponse.body["name"]).toEqual("e");

    let fGetResponse = await orchestratorApi.get(`/file/module/${fId}`);
    expect(fGetResponse.body["name"]).toEqual("f");
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
    expect(wasmUploadResponse.body).toHaveProperty("fields");

    let fields = wasmUploadResponse.body["fields"];
    expect(fields).toHaveProperty("exports");
    expect(fields["exports"]).toHaveProperty(length);
    expect(fields["exports"].length).toBeGreaterThan(0);
    expect(fields["exports"][0])
        .toEqual({ "name": "add1", "parameterCount": 1 });
  });

  test("creation then individual deletion success", async () => {
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
    expect(moduleListResponse.length).toBeGreaterThan(0);
    
    let moduleDeleteResponse = await orchestratorApi.delete(`/file/module/`)
      .expect(200);

    // NOTE: Not testing for exact match or if anything can fetched after full
    // deletion, because of test synchronization ambiguity.
    expect(moduleDeleteResponse).toHaveProperty("deletedCount");
    expect(moduleDeleteResponse["deletedCount"]).toBeGreaterThan(0);
  });
});