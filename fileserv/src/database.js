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
* - An undefined filter matches all the documents in a collection.
* - The `idField` field on a filter is special meaning the unique identifier or
*   primary key of a document/record in the database represented as a string of
*   characters.
*
* NOTE about parameters and return values:
* - Like filters, creation operates on multiple i.e. a list of new documents.
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

    async close()
    { throw "close not implemented"; }

    /*
    * C
    * NOTE: Should always [upsert](https://www.mongodbtutorial.org/mongodb-crud/mongodb-upsert/).
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

    async close() {
        return this.client.close();
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

/**
 * For testing.
 */
class MockDatabase extends Database {
    constructor() {
        super();
        this.reset()
    }

    /**
     * Helper for resetting between tests.
     */
    reset() {
        this.db = {};
        this.runningId = 0;
    }

    async connect() {
        console.log("Connected to a fake database!");
    }

    async close() {
        console.log("Closing the fake database.");
    }

    async create(collectionName, documents)
    {
        // Create the collection if needed.
        if (!(collectionName in this.db)) {
            console.log(`MockDB creating collection '${collectionName}'`);
            this.db[collectionName] = [];
        }

        // Prepare bulk inserts.
        let inserts = [];
        for (let values of documents) {
            if (Database.idField in values) {
                throw `cannot create new document with an existing ${Database.idField} field ${values}`;
            }

            values[Database.idField] = this.runningId;
            this.runningId += 1;
            console.log("MockDB creating new document with values", values);

            inserts.push(values);
        }

        for (let insert of inserts) {
            this.db[collectionName].push(insert);
        }

        return { acknowledged: true, insertedIds: inserts.map(x => x[Database.idField]) };
    }

    async read(collectionName, filter) {
        if (filter) {
            try {
                this.checkIdField(filter);
                let result = this.db[collectionName].filter(this.equals(filter));
                console.log(result);
                return result;
            } catch(_) {
                return [];
            }
        }
        console.log(this.db[collectionName]);
        return this.db[collectionName];
    }

    async update(collectionName, filter, fields) {
        if (filter) { this.checkIdField(filter) } else { filter = {} };

        let matches = this.db[collectionName].filter(this.equals(filter))

        if (matches.length === 0) {
            // Upsert.
            await this.create(collectionName, fields);
        } else {
            for (let match of matches) {
                for (let [key, value] of Object.entries(fields)) {
                    match[key] = value;
                }
            }
        }

        return { acknowledged: true };
    }

    async delete(collectionName, filter) {
        let deletables;
        if (filter) {
            deletables = (await this.read(collectionName, filter));
        } else {
            // Delete all.
            deletables = this.db[collectionName];
        }

        // Can't delete just the actual objects, so have to index the parent object with IDs.
        for (let deletableId of deletables.map(x => x[Database.idField])) {
            delete this.db[collectionName].find(x => x[idField] === deletableId);
        }
    }

    /**
     * Return a function that compares equality with filter and an object (i.e.,
     * a doc in db).
     */
    equals(filter) {
        // The comparison here is non-strict on purpose.
        return (x) => filter[Database.idField] == x[Database.idField];
    }

    checkIdField(filter) {
        if (!(Database.idField in filter)) {
            throw `cannot query mock database without an id-field '${Database.idField}'`;
        }
    }
}

module.exports = {
    Database,
    MongoDatabase,
    MockDatabase,
};
