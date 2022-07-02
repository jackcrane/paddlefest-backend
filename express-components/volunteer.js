import express from "express";
import { OpenConnection, ObjectId } from "../util/mongo-handler.js";
const { db } = await OpenConnection();
const router = express.Router();
import send, { renderShifts } from "../util/mailManager.js";
import "dotenv/config";

router.get("/list-jobs/:location", async (req, res) => {
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

router.post("/signup", async (req, res) => {
  // console.log(req.body.basicInfo);
  console.log(req.body);
  // Verify email and name are not in the database
  let collection = await db.collection("volunteers");
  let userExists = await collection.findOne({
    email: req.body.basicInfo.email,
    name: req.body.basicInfo.name,
  });
  if (userExists) {
    res.sendStatus(409);
    return;
  }
  req.body.basicInfo;
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
  collection = await db.collection("volunteers");
  let user = await collection.insertOne({
    ...req.body.basicInfo,
    jobs: sjobs,
    waiver: req.body.waiver,
  });

  let _continue = true;

  collection = await db.collection("volunteer-jobs");
  Object.keys(sjobs).forEach((loc) => {
    loc = sjobs[loc];
    Object.keys(loc).forEach(async (job) => {
      let jobdata = await collection.findOne({ _id: ObjectId(job) });
      console.log("jobdata", jobdata);
      let shifts = loc[job];
      shifts.forEach(async (shift) => {
        let index = jobdata.shifts.findIndex((obj) => obj._id == shift);
        console.log(shift);
        console.log(index);
        console.log(jobdata.shifts[index]);
        if (index > -1) {
          if (
            !jobdata.shifts[index].volunteers.includes(
              new ObjectId(user.insertedId)
            )
          ) {
            jobdata.shifts[index].volunteers.push(
              new ObjectId(user.insertedId)
            );
          }
        } else {
          _continue = false;
          res.status(411).send({ error: "shift not found. might be full" });
          return;
        }
      });
      if (_continue) {
        await collection.updateOne(
          { _id: ObjectId(job) },
          { $set: { shifts: jobdata.shifts } }
        );
      }
    });
  });

  const maild = {
    to: req.body.basicInfo.email,
    text: { ...req.body.basicInfo, jobs: sjobs },
    id: user.insertedId.toString(),
  };
  if (_continue) {
    let email = await send(maild);
    res.status(200).json({
      acnowledged: {
        basicInfo: req.body.basicInfo,
        jobs: sjobs,
        emailSent: email,
      },
    });
  }
});

router.get("/jobs/exchange/shift/:shift", async (req, res) => {
  const collection = await db.collection("volunteer-jobs");
  const job = await collection.findOne({
    "shifts._id": new ObjectId(req.params.shift),
  });
  res.json(job);
});

router.get("/jobs/exchange/job/:job", async (req, res) => {
  console.log(req.params);
  const collection = await db.collection("volunteer-jobs");
  const job = await collection.findOne({ _id: ObjectId(req.params.job) });
  res.json(job);
});

router.get("/jobs", async (req, res) => {
  const collection = db.collection("volunteer-jobs");
  const jobs = await collection.find({}).toArray();
  res.json(jobs);
});

export default router;
