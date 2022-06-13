import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import expressWs from "express-ws";
const app = express();
const port = 3001;
const ws = expressWs(app);
import cors from "cors";
import "dotenv/config";
import fetch from "node-fetch";
import { Expo } from "expo-server-sdk";
let expo = new Expo();
import fileUpload from "express-fileupload";
import { UploadToS3 } from "./util/s3.js";
import send from "./util/mailManager.js";

const MONGO_URL = process.env.MONGO_URI;

const MONGO_CLIENT = new MongoClient(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

await MONGO_CLIENT.connect();
const db = await MONGO_CLIENT.db("paddlefest");
const collection = await db.collection("users");
app.use(
  express.urlencoded({
    extended: false,
    limit: "100mb",
    parameterLimit: 1000000,
  })
);

app.use(cors());

app.use(express.json());

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

app.post("/send-notification/individual", async (req, res) => {
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

app.post("/send-notification/everyone", async (req, res) => {
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

app.post(
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

app.post("/get-images", async (req, res) => {
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

app.get("/all-points", async (req, res) => {
  let f = await collection.find({}).toArray();
  res.send(f);
});

app.post("/like-image", async (req, res) => {
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

app.get("/schedule", async (req, res) => {
  const collection = await db.collection("events");
  const schedule = await collection.find({}).toArray();
  res.send(schedule);
});

app.get("/version", (req, res) => {
  res.json({ version: process.env.VERSION });
});

app.post("/create-job", async (req, res) => {
  const collection = await db.collection("volunteer-jobs");
  const _shifts = Object.values(req.body.shifts);
  const shifts = _shifts.map((shift) => {
    //insert mongodb id:
    return {
      start: shift.start,
      end: shift.end,
      _id: new ObjectId(),
      volunteers: [],
      max: shift.max,
    };
  });
  const restrictions = Object.values(req.body.restrictions);

  const job = await collection.insertOne({
    ...req.body,
    shifts,
    restrictions,
    timestamp: new Date(),
  });
  res.json(job);
});

app.get("/list-jobs/:location", async (req, res) => {
  const collection = await db.collection("volunteer-jobs");
  const jobs = await collection
    .find({ location: req.params.location })
    .toArray();
  res.send(jobs);
});

const emptyObj = (obj) => {
  // sort through the object `objs` and see if any keys equal an empty array. If so, remove them from the object.
  const o = Object.keys(obj).forEach((key) => {
    if (obj[key] instanceof Array && obj[key].length === 0) {
      delete obj[key];
    }
  });
  return obj;
};

app.post("/signup", async (req, res) => {
  // console.log(req.body.basicInfo);
  console.log(req.body);
  let njobs = {};
  Object.keys(req.body.jobs).map((loc) => {
    let obj = req.body.jobs[loc];
    njobs[loc] = emptyObj(obj);
  });
  let sjobs = {};
  Object.keys(njobs).forEach((loc) => {
    if (Object.keys(njobs[loc]).length > 0) {
      sjobs[loc] = njobs[loc];
    }
  });
  // console.log(sjobs);
  let collection = await db.collection("volunteers");
  let user = await collection.insertOne({
    ...req.body.basicInfo,
    jobs: sjobs,
  });

  collection = await db.collection("volunteer-jobs");
  Object.keys(sjobs).forEach((loc) => {
    loc = sjobs[loc];
    Object.keys(loc).forEach(async (job) => {
      let jobdata = await collection.findOne({ _id: ObjectId(job) });
      let shifts = loc[job];
      shifts.forEach(async (shift) => {
        let index = jobdata.shifts.findIndex((obj) => obj._id == shift);
        console.log(index);
        if (!jobdata.shifts[index].includes(user.insertedId)) {
          jobdata.shifts[index].volunteers.push(new ObjectId(user.insertedId));
        }
      });
      await collection.updateOne(
        { _id: ObjectId(job) },
        { $set: { shifts: jobdata.shifts } }
      );
    });
  });

  const maild = {
    to: req.body.basicInfo.email,
    text: { ...req.body.basicInfo, jobs: sjobs },
    id: user.insertedId.toString(),
  };
  let email = await send(maild);

  res.status(200).json({
    acnowledged: {
      basicInfo: req.body.basicInfo,
      jobs: sjobs,
      emailSent: email,
    },
  });
});

app.get("/jobs/exchange/shift/:shift", async (req, res) => {
  const collection = await db.collection("volunteer-jobs");
  const job = await collection.findOne({
    "shifts._id": new ObjectId(req.params.shift),
  });
  res.json(job);
});

app.get("/jobs/exchange/job/:job", async (req, res) => {
  console.log(req.params);
  const collection = await db.collection("volunteer-jobs");
  const job = await collection.findOne({ _id: ObjectId(req.params.job) });
  res.json(job);
});

app.post("/add-shift", async (req, res) => {
  let collection = await db.collection("volunteer-jobs");
  const { volunteer, shift } = req.body;
  const job = await collection.findOne({ "shifts._id": ObjectId(shift) });
  const index = job.shifts.findIndex((obj) => obj._id == shift);
  job.shifts[index].volunteers.push(volunteer);
  await collection.updateOne(
    { "shifts._id": ObjectId(shift) },
    { $set: { shifts: job.shifts } }
  );
  collection = await db.collection("volunteers");
  const user = await collection.findOne({ _id: ObjectId(volunteer) });
  const jobIndex = user.jobs[job.location].findIndex((obj) => obj._id == shift);
  user.jobs[job.location][jobIndex].volunteers.push(job._id);
  await collection.updateOne(
    { _id: ObjectId(volunteer) },
    { $set: { jobs: user.jobs } }
  );
  res.sendStatus(200);
});

app.post("/remove-shift", async (req, res) => {
  let collection = await db.collection("volunteer-jobs");
  const { volunteer, shift } = req.body;
  const job = await collection.findOne({
    "shifts._id": new ObjectId(shift),
  });
  const index = job.shifts.findIndex((obj) => obj._id == shift);
  job.shifts[index].volunteers = job.shifts[index].volunteers.filter(
    (id) => id != volunteer
  );
  await collection.updateOne(
    { _id: ObjectId(job._id) },
    { $set: { shifts: job.shifts } }
  );
  collection = await db.collection("volunteers");
  let cc = await collection.findOne({ _id: ObjectId(volunteer) });
  let ccc = {};
  for (let loc in cc.jobs) {
    ccc[loc] = {};
    console.log(loc);
    for (let job in cc.jobs[loc]) {
      ccc[loc][job] = cc.jobs[loc][job].filter((id) => id != shift);
    }
  }
  for (let i = 0; i < 10; i++) {
    for (let loc in ccc) {
      if (Object.keys(ccc[loc]).length === 0) {
        delete ccc[loc];
      } else {
        for (let job in ccc[loc]) {
          if (ccc[loc][job].length === 0) {
            delete ccc[loc][job];
          }
        }
      }
    }
  }
  await collection.updateOne(
    { _id: ObjectId(volunteer) },
    { $set: { jobs: ccc } }
  );
  console.log(ccc);
  res.sendStatus(200);
});

app.post("/delete-volunteer", async (req, res) => {
  const volunteerId = req.body._id;
  let collection = await db.collection("volunteer-jobs");
  const jobs = await collection
    .find({
      "shifts.volunteers": ObjectId(volunteerId),
    })
    .toArray();
  for (let job of jobs) {
    let running = true;
    while (running) {
      let index = job.shifts.findIndex((obj) =>
        obj.volunteers.some((id) => id.toString() == volunteerId)
      );
      if (index == -1) {
        running = false;
      } else {
        const nvols = job.shifts[index].volunteers.filter((id) => {
          return id.toString() != volunteerId;
        });
        job.shifts[index].volunteers = nvols;
      }
    }
    await collection.updateOne(
      { _id: ObjectId(job._id) },
      { $set: { shifts: job.shifts } }
    );
  }
  collection = await db.collection("volunteers");
  const user = await collection.deleteOne({ _id: ObjectId(volunteerId) });
  res.sendStatus(200);
});

app.get("/volunteer/:volunteer/jobs", async (req, res) => {
  const collection = db.collection("volunteers");
  let volunteer = await collection.findOne({
    _id: ObjectId(req.params.volunteer),
  });
  res.json(volunteer.jobs);
});

app.get("/shift/:shift", async (req, res) => {
  const collection = db.collection("volunteer-jobs");
  let _job = await collection.findOne({
    "shifts._id": new ObjectId(req.params.shift),
  });
  const job = {
    _id: _job._id,
  };
  let shiftIdx = _job.shifts.findIndex((obj) => obj._id == req.params.shift);
  const shift = _job.shifts[shiftIdx];
  res.json({ job, shift });
});

app.get("/volunteers", async (req, res) => {
  const collection = db.collection("volunteers");
  const volunteers = await collection.find({}).toArray();
  res.json(volunteers);
});

app.get("/volunteer/:volunteer", async (req, res) => {
  const collection = db.collection("volunteers");
  const volunteer = await collection.findOne({
    _id: ObjectId(req.params.volunteer),
  });
  res.json(volunteer);
});

app.get("/shifts/:volunteer/:job", async (req, res) => {
  const collection = db.collection("volunteer-jobs");
  const job = await collection.findOne({
    _id: ObjectId(req.params.job),
  });
  const _shifts = job.shifts.filter((obj) => {
    let vols = obj.volunteers.map((id) => id.toString());
    return vols.includes(req.params.volunteer);
  });
  res.json(_shifts);
});

app.post("/update-notes", async (req, res) => {
  const { _id: volunteer, notes } = req.body;
  console.log(volunteer, notes);
  const collection = db.collection("volunteers");
  const user = await collection.findOne({ _id: ObjectId(volunteer) });
  user.notes = notes;
  await collection.updateOne(
    { _id: ObjectId(volunteer) },
    { $set: { notes: notes } }
  );
  res.sendStatus(200);
});

app.get("/jobs", async (req, res) => {
  const collection = db.collection("volunteer-jobs");
  const jobs = await collection.find({}).toArray();
  res.json(jobs);
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
