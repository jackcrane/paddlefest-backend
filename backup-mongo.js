import { MongoClient } from "mongodb";
import "dotenv/config";
import moment from "moment";
import { writeFileSync } from "fs";

const MONGO_URL = process.env.MONGO_URI;

const MONGO_CLIENT = new MongoClient(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

await MONGO_CLIENT.connect();
const db = await MONGO_CLIENT.db("paddlefest");
const collection = await db.collection("volunteer-jobs");

let a = await collection.find({}).toArray();
writeFileSync("./volunteer-jobs.json", JSON.stringify(a, null, 2));
