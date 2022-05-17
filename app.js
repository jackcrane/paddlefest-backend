import express from "express";
import { MongoClient } from "mongodb";
import expressWs from "express-ws";
const app = express();
const port = 3001;
const ws = expressWs(app);
import cors from "cors";
import "dotenv/config";

const MONGO_URL = process.env.MONGO_URI;

const MONGO_CLIENT = new MongoClient(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

await MONGO_CLIENT.connect();
const db = await MONGO_CLIENT.db("paddlefest");
const collection = await db.collection("users");

app.use(cors());

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.post("/register-notification-token", async (req, res) => {
  console.log(req.body);
  const user = await collection.findOne({ deviceId: req.body.deviceId });
  if (!user) {
    await collection.insertOne({
      ...req.body,
    });
  }
  res.sendStatus(200);
});

app.post("/set-location", (req, res) => {
  console.log(req.body);
  collection.updateOne(
    { deviceId: req.body.deviceId },
    {
      $set: {
        location: {
          latitude: req.body.location[0].coords.latitude,
          longitude: req.body.location[0].coords.longitude,
          accuracy: req.body.location[0].coords.accuracy,
        },
      },
    }
  );
  res.sendStatus(200);
});

const wss = [];

const changeStream = collection.watch();
changeStream.on("change", async (change) => {
  console.log(change);
  // get changed document
  const changedDoc = await collection.findOne({ _id: change.documentKey._id });
  wss.forEach((ws) =>
    ws.send(
      JSON.stringify({
        type: "update",
        change: change,
        fullDocument: changedDoc,
      })
    )
  );
});

app.ws("/dash/watch", async (ws, req) => {
  wss.push(ws);
  ws.send(
    JSON.stringify({
      type: "init",
      connected: true,
      points: await collection.find({}).toArray(),
    })
  );
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
