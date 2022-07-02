import { MongoClient, ObjectId } from "mongodb";

const OpenConnection = async () => {
  const MONGO_URL = process.env.MONGO_URI;

  const MONGO_CLIENT = new MongoClient(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  await MONGO_CLIENT.connect();
  const db = await MONGO_CLIENT.db("paddlefest");

  return { db };
};

export { OpenConnection, ObjectId };
