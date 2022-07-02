import express from "express";
import { OpenConnection, ObjectId } from "../util/mongo-handler.js";
const { db } = await OpenConnection();
const router = express.Router();
import send, { renderShifts } from "../util/mailManager.js";
import XLSX from "xlsx";
import path from "path";
import "dotenv/config";

const replaceAll = function (string, search, replacement) {
  var target = string;
  return target.replace(new RegExp(search, "g"), replacement);
};

router.post("/create-job", async (req, res) => {
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

router.post("/add-shift", async (req, res) => {
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

router.post("/remove-shift", async (req, res) => {
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

router.post("/delete-volunteer", async (req, res) => {
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

router.get("/volunteer/:volunteer/jobs", async (req, res) => {
  const collection = db.collection("volunteers");
  let volunteer = await collection.findOne({
    _id: ObjectId(req.params.volunteer),
  });
  res.json(volunteer.jobs);
});

router.get("/shift/:shift", async (req, res) => {
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

router.get("/volunteers", async (req, res) => {
  const collection = db.collection("volunteers");
  const volunteers = await collection.find({}).toArray();
  res.json(volunteers);
});

router.get("/volunteer/:volunteer", async (req, res) => {
  const collection = db.collection("volunteers");
  const volunteer = await collection.findOne({
    _id: ObjectId(req.params.volunteer),
  });
  res.json(volunteer);
});

router.get("/shifts/:volunteer/:job", async (req, res) => {
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

router.post("/update-notes", async (req, res) => {
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

router.get("/export", async (req, res) => {
  // Return a excel file of each volunteer's name, phone number, email, and jobs.
  const collection = db.collection("volunteers");
  const volunteers = await collection.find({}).toArray();
  const data = await Promise.all(
    volunteers.map(async (volunteer) => {
      let {
        name,
        phonenum,
        email,
        notes,
        jobs,
        shirt_size,
        heard_about,
        _id,
        waiver,
      } = volunteer;
      console.log(volunteer);
      let rjobs = await renderShifts(jobs);
      notes = notes ? replaceAll(notes, "\r\n", "\n") : "";
      jobs = rjobs;
      switch (shirt_size) {
        case "xs":
          shirt_size = "Extra Small";
          break;
        case "XS":
          shirt_size = "Extra Small";
          break;
        case "s":
          shirt_size = "Small";
          break;
        case "S":
          shirt_size = "Small";
          break;
        case "m":
          shirt_size = "Medium";
          break;
        case "M":
          shirt_size = "Medium";
          break;
        case "l":
          shirt_size = "Large";
          break;
        case "L":
          shirt_size = "Large";
          break;
        case "xl":
          shirt_size = "Extra Large";
          break;
        case "XL":
          shirt_size = "Extra Large";
          break;
        case "xxl":
          shirt_size = "Extra Extra Large";
          break;
        case "XXL":
          shirt_size = "Extra Extra Large";
          break;
        default:
          shirt_size = shirt_size;
          break;
      }
      return {
        name,
        phone: phonenum,
        email,
        notes,
        jobs,
        shirtsize: shirt_size,
        heard_about,
        _id: _id.toString(),
        waiverType: waiver?.waiverType || "unknown",
        waiverMinorDob: waiver?.minorDob || "unknown",
        waiverMinorName: waiver?.minorName || "unknown",
        waiverParentEmail: waiver?.parentEmail || "unknown",
        waiverEmergencyName: waiver?.emergencyName || "unknown",
        waiverEmergencyPhone: waiver?.emergencyPhone || "unknown",
        waiverEmergencyEmail: waiver?.emergencyEmail || "unknown",
      };
    })
  );
  const binaryWS = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, binaryWS, "Volunteers");
  XLSX.writeFile(wb, "volunteers.xlsx");
  res.sendFile(path.resolve("./volunteers.xlsx"));
});

router.post("/set-leader", async (req, res) => {
  const { _id: volunteer, state } = req.body;
  const collection = db.collection("volunteers");
  const user = await collection.findOne({ _id: ObjectId(volunteer) });
  user.leader = state;
  await collection.updateOne(
    { _id: ObjectId(volunteer) },
    { $set: { leader: state } }
  );
  res.sendStatus(200);
});

router.post("/set-area-of-responsibility", async (req, res) => {
  const { _id: volunteer, areaOfResponsibility } = req.body;
  const collection = db.collection("volunteers");
  const user = await collection.findOne({ _id: ObjectId(volunteer) });
  user.areaOfResponsibility = areaOfResponsibility;
  await collection.updateOne(
    { _id: ObjectId(volunteer) },
    { $set: { areaOfResponsibility } }
  );
  res.sendStatus(200);
});

router.post("/apply-text-groups", async (req, res) => {
  const { _id: volunteer, textGroups } = req.body;
  const collection = db.collection("volunteers");
  const user = await collection.findOne({ _id: ObjectId(volunteer) });
  user.textGroups = textGroups;
  await collection.updateOne(
    { _id: ObjectId(volunteer) },
    { $set: { textGroups } }
  );
  res.sendStatus(200);
});

export default router;
