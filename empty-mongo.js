import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import moment from "moment";

const MONGO_URL = process.env.MONGO_URI;

const MONGO_CLIENT = new MongoClient(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

await MONGO_CLIENT.connect();
const db = await MONGO_CLIENT.db("paddlefest");
const collection = await db.collection("volunteer-jobs");

collection.updateOne({ _id: new ObjectId('629a8f0e5634feafc135eea9') }, {
  $set: {
    shifts: [
      
    ]
  }
})