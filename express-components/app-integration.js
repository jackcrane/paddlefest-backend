import express from "express";
import { OpenConnection, ObjectId } from "../util/mongo-handler.js";
const { db } = await OpenConnection();
const router = express.Router();
import fileUpload from "express-fileupload";
import { Expo } from "expo-server-sdk";
let expo = new Expo();
import { UploadToS3 } from "../util/s3.js";
import "dotenv/config";

router.post("/register-notification-token", async (req, res) => {
  console.log(req.body);
  const collection = db.collection("users");
  const user = await collection.findOne({ deviceId: req.body.deviceId });
  if (!user) {
    await collection.insertOne({
      ...req.body,
    });
  }
  res.sendStatus(200);
});

router.post("/register-notification-token", async (req, res) => {
  console.log(req.body);
  const collection = db.collection("users");
  const user = await collection.findOne({ deviceId: req.body.deviceId });
  if (!user) {
    await collection.insertOne({
      ...req.body,
    });
  }
  res.sendStatus(200);
});

router.post("/set-location", (req, res) => {
  console.log(req.body);
  const collection = db.collection("users");
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

router.post("/send-notification/individual", async (req, res) => {
  if (!Expo.isExpoPushToken(req.body.token)) {
    res.sendStatus(400);
    console.log("bad token");
  } else {
    let e = await expo.sendPushNotificationsAsync([
      {
        to: req.body.token,
        title: req.body.title,
        body: req.body.body,
      },
    ]);
    if (e[0].status == "ok") {
      res.sendStatus(200);
    } else {
      res.status(400).send(e.message);
    }
  }
});

router.post("/send-notification/everyone", async (req, res) => {
  const collection = db.collection("users");
  let tokens = await (
    await collection.find({}).toArray()
  ).map((entry) => entry.expo);
  tokens.filter((token) => Expo.isExpoPushToken(token));
  let messages = [];
  tokens.forEach((token) =>
    messages.push({
      to: token,
      title: req.body.title,
      body: req.body.body,
    })
  );
  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];
  (async () => {
    chunks.forEach(async (chunk) => {
      let ticket = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(ticket);
    });
  })();
  let recipts = [];
  let failures = [];
  tickets.forEach((ticket) => {
    if (ticket.status == "ok") {
      recipts.push(ticket.ticket.id);
    } else {
      failures.push(ticket.message);
      console.log("An error occured", ticket);
    }
  });
  res.send({
    successes: recipts.length,
    failures: failures.length,
    failures: failures,
  });
});

router.post(
  "/upload-image",
  fileUpload({
    limits: {
      // fileSize: 500 * 1024 * 1024,
      useTempFiles: true,
      tempFileDir: "./upload-tmp",
    },
  }),
  async (req, res) => {
    let collection = await db.collection("images");
    const { url, uuid } = await UploadToS3(req.files.image.data);
    await collection.insertOne({
      url,
      uuid,
      timestamp: new Date(),
      likes: 0,
      caption: req.body.caption,
      credit: req.body.user,
      deviceId: req.body.deviceId,
    });
    res.send({
      url,
    });
  }
);

router.post("/get-images", async (req, res) => {
  const { start, count } = req.body;
  if (start == undefined || count == undefined) {
    res.sendStatus(400);
    return;
  }
  const collection = await db.collection("images");
  let images = await collection
    .find({})
    .sort({ timestamp: -1 })
    .skip(start)
    .limit(count)
    .toArray();
  images = images.map((img) => {
    return {
      ...img,
      likedby: null,
      likedCount: img.likedby ? img.likedby.length : 0,
    };
  });
  res.send(images);
});

router.post("/like-image", async (req, res) => {
  let collection = await db.collection("images");
  let image = await collection.findOne({ uuid: req.body.uuid });
  if (image) {
    await collection.updateOne(
      { uuid: req.body.uuid },
      { $addToSet: { likedby: req.body.deviceId } }
    );
    let usercoll = await db.collection("users");
    await usercoll.updateOne(
      { deviceId: req.body.deviceId },
      { $addToSet: { liked: req.body.uuid } }
    );
    res.sendStatus(200);
  } else {
    res.sendStatus(400);
  }
});

router.get("/schedule", async (req, res) => {
  const collection = await db.collection("events");
  const schedule = await collection.find({}).toArray();
  res.send(schedule);
});

router.get("/points", async (req, res) => {
  const collection = db.collection("map-points");
  const points = await collection.find({}).toArray();
  res.json(points);
});

export default router;
