const supertest = require('supertest');
const { app, shutDown } = require('../server');

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