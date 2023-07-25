module.exports = {
    name: "primitive",
    openapi: {
        "servers": [
            {
                "url": "http://{serverIp}:{port}",
            }
        ],
        "paths": {
            "/{deployment}/modules/{module}/primitive": {
                "get": {
                    "parameters": [
                        {
                            "name": "number",
                            "schema": {
                                "type": "integer",
                                "format": "int64"
                            }
                        }
                    ],
                    "responses": {
                        "200": {
                            "content": {
                                "application/octet-stream": {
                                    "schema": {
                                        "type": "integer",
                                        "format": "int64"
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};