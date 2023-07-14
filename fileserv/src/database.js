const { MongoClient } = require("mongodb");

/*
* Abstract base class for using different database implementations.
*
* The abstracticity is implemented in a Python way, which might not
* be idiomatic Javascript.
*
* NOTE: All the CRUD(-like) operations operate on multiple matches of the given
* filter.
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
    async create(collectionName, values)
    { throw "create not implemented"; }

    /*
    * R
    * @returns Array of filter matches.
    */
    async read(collectionName, filter)
    { throw "read not implemented"; }

    /*
    * U
    */
    async update(collectionName, filter, fields)
    { throw "update not implemented"; }

    /*
    * D
    */
    async delete(collectionName, filter)
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

    async create(collectionName, values)
    {
        return this.db
            .collection(collectionName)
            .insertMany(values);
    }

    async read(collectionName, filter) {
        return (await this.db
            .collection(collectionName)
            .find(filter)
        ).toArray();
    }

    /**
     * NOTE: Always upserts.
     */
    async update(collectionName, filter, fields) {
        return this.db
            .collection(collectionName)
            .updateMany(
                filter,
                { $set: fields },
                // Always create the fields if missing.
                { upsert: true }
            );

    }

    async delete(collectionName, filter) {
        return this.db
            .collection(collectionName)
            .deleteMany(filter ? filter : {});
    }
}

module.exports = {
    Database,
    MongoDatabase,
};
