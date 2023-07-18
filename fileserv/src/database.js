const { MongoClient, ObjectId } = require("mongodb");

/*
* Abstract base class for using different database implementations.
*
* The abstracticity is implemented in a Python way, which might not
* be idiomatic Javascript.
*
* NOTE about filters:
* - All the CRUD(-like) operations operate on multiple matches of the given
*   filter.
* - The `idField` field on a filter is special meaning the unique identifier or
*   primary key of a document/record in the database represented as a string of
*   characters.
*
* NOTE about return values:
* - If the `idField` is found in the document returned from database, it should
*   be possible to convert into an equivalent string representation with a
*   method `toString`.
*   For example the following way should be able to print out the document id as
*   a string:
*   ```
*   let doc = read("foo", {})[0];
*   if (idField in doc) { console.log("Id is: ", doc._id.toString()) }
*   ```
*/
class Database {
    static idField = "_id";

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
        this.db = this.client.db();
    }

    async create(collectionName, values)
    {
        return this.db
            .collection(collectionName)
            .insertMany(values);
    }

    async read(collectionName, filter) {
        this.wrapId(filter); 

        return (this.db
                .collection(collectionName)
                .find(filter)
            ).toArray();
    }

    /**
     * NOTE: Always upserts.
     */
    async update(collectionName, filter, fields) {
        this.wrapId(filter);

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
        this.wrapId(filter);

        return this.db
            .collection(collectionName)
            .deleteMany(filter ? filter : {});
    }

    /**
     *  Wrap a found id into Mongo's ObjectId.
     * @param {*} filter The filter to search for id field.
     */
    wrapId(filter) {
        if (filter && Database.idField in filter) {
            filter[Database.idField] = ObjectId(filter[Database.idField]);
        }
    }
}

module.exports = {
    Database,
    MongoDatabase,
};
