const { MongoClient } = require("mongodb");

/*
* Abstract base class for using different database implementations.
*
* The abstracticity is implemented in a Python way, which might not
* be idiomatic Javascript.
*/
class Database {
    constructor(value) {}

    /*
    * @throws If the database connection fails.
    */
    async connect()
    { throw "connect not implemented"; }

    /*
    * C
    */
    async create(collectionName, key, value)
    { throw "create not implemented"; }

    /*
    * R
    */
    async read(collectionName, key)
    { throw "read not implemented"; }

    /*
    * U
    */
    async update(collectionName, key, value)
    { throw "update not implemented"; }

    /*
    * D
    */
    async delete(collectionName, key)
    { throw "delete not implemented"; }

    async close()
    { throw "close not implemented"; }
}


class MongoDatabase extends Database {
    constructor(uri) {
        super();
        this.client = new MongoClient(uri);
    }

    async connect() {
        await this.client.connect();
        // Save reference to the actual database.
        this.db = await this.client.db();
    }

    async create(collectionName, key, value)
    {
        this.db.collection(collectionName)
    }

    async read(collectionName, key)
    { throw "not implemented"; }

    async update(collectionName, key, value)
    { throw "not implemented"; }

    async delete(collectionName, key)
    { throw "not implemented"; }

    async close() { 
        this.client.close();
    }
}

module.exports = {
    Database,
    MongoDatabase,
};
