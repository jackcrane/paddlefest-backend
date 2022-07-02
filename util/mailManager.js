import formData from "form-data";
import MailGun from "mailgun.js";
const mailgun = new MailGun(formData);
const mg = mailgun.client({
  username: "api",
  key: "key-fd8557851d598c6483edfd5d78c8b4c8",
});
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

const MONGO_URL = process.env.MONGO_URI;

const MONGO_CLIENT = new MongoClient(MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

await MONGO_CLIENT.connect();
const db = await MONGO_CLIENT.db("paddlefest");
const collection = await db.collection("volunteer-jobs");

import moment from "moment";
import tz from "moment-timezone";

import ejs from "ejs";
import { readFileSync, writeFileSync } from "fs";

const switchForFullLocation = (loc) => {
  switch (loc) {
    case "expo":
      return "Outdoors for All Expo";
      break;
    case "putin":
      return "Launch";
      break;
    case "launch":
      return "Launch";
      break;
    case "midpoint":
      return "4.5 Mile Finish Line / Midpoint";
      break;
    case "finishline":
      return "Finish Line Festival";
      break;
    default:
      return loc;
  }
};

const parse = async (jobs) => {
  let matched_obj = {};
  for (let loc in jobs) {
    matched_obj[loc] = {};
    for (let job in jobs[loc]) {
      let fjob = await collection.findOne({
        _id: new ObjectId(job),
      });
      matched_obj[loc][fjob.title] = jobs[loc][job];
      for (let shift in jobs[loc][job]) {
        let _shift = jobs[loc][job][shift];
        let fshift =
          fjob.shifts[
            fjob.shifts.findIndex((obj) => {
              return obj._id == _shift;
            })
          ];
        matched_obj[loc][fjob.title][shift] = fshift;
      }
    }
  }
  return matched_obj;
};

const stringify = async (d) => {
  let str = "";
  Object.keys(d).forEach(async (loc) => {
    str += `${switchForFullLocation(loc)}:\n`;
    Object.keys(d[loc]).forEach(async (job) => {
      str += `├─ ${job}\n`;
      d[loc][job].forEach((shift) => {
        str += `├── ${moment(shift.start)
          .tz("America/New_York")
          .format("hh:mm a")} - ${moment(shift.end)
          .tz("America/New_York")
          .format("hh:mm a")}\n`;
      });
    });
  });
  return str;
};

const switchForParking = (loc) => {
  switch (loc) {
    case "expo":
      return "<b>Friday Outdoors for All Expo</b>: Schmidt Recreation Complex is at 2944 Humbert Ave. Volunteer parking at Schmidt is extremely limited. If you aren’t helping early in the day (before the Expo starts), we suggest parking on an adjacent street or at Riverview East Academy, 3555 Kellogg Ave., to avoid traffic congestion. Check in at the Boat House to receive your T-shirt and instructions. ";
      break;
    case "putin":
      return "<b>Saturday Launch</b>: Schmidt Recreation Complex is at 2944 Humbert Ave. Enter on St. Peters Street and check in with the parking company for directions to volunteer";
      break;
    case "launch":
      return "<b>Saturday Launch</b>: Schmidt Recreation Complex is at 2944 Humbert Ave. Enter on St. Peters Street and check in with the parking company for directions to volunteer";
      break;
    case "midpoint":
      return "<b>Saturday 4.5 Mile Finish Line / 9.0 Mile Midpoint</b>: The Public Landing is at 435 E. Mehring Way.";
      break;
    case "finishline":
      return "<b>Saturday Finish Line Festival</b>: Gilday Riverside Park is at 3540 Southside Ave. Check in with the parking company for directions to the volunteer parking area.";
      break;
    default:
      return "";
  }
};

const parking = (data) => {
  let str = "";
  console.log("pj", data);
  for (let loc in data) {
    str += `${switchForParking(loc)}\n`;
  }
  return str;
};

const renderShifts = async (text) => {
  let p = await (await stringify(await parse(text))).toString();
  return p;
};

const send = async ({ to, text, id }) => {
  let p = await (await stringify(await parse(text.jobs))).toString();
  let _parking = parking(text.jobs);
  console.log(_parking);
  console.log(p);
  let html = ejs.render(
    readFileSync("./util/email.ejs", { encoding: "utf8" }),
    {
      data: text,
      jobs: p,
      id: id,
      parking: _parking,
    }
  );
  writeFileSync("./util/email.html", html);
  let m = await mg.messages.create("mailgun.jackcrane.rocks", {
    from: "Paddlefest Volunteer Registration <paddlefest@mailgun.jackcrane.rocks>",
    subject: "Your Paddlefest volunteer registration confirmation",
    to: [to],
    cc: "3jbc22@gmail.com",
    html,
  });
  return m.status === 200;
};

const update = async ({ to, text, id }) => {
  let p = await (await stringify(await parse(text.jobs))).toString();
  let _parking = parking(text.jobs);
  console.log(_parking);
  console.log(p);
  let html = ejs.render(
    readFileSync("./util/email.ejs", { encoding: "utf8" }),
    {
      data: text,
      jobs: renderShifts(text.jobs),
      id: id,
      parking: _parking,
    }
  );
  writeFileSync("./util/email.html", html);
  let m = await mg.messages.create("mailgun.jackcrane.rocks", {
    from: "Paddlefest Volunteer Registration <paddlefest@mailgun.jackcrane.rocks>",
    subject: "Updates to your Paddlefest volunteer registration",
    to: [to],
    cc: "3jbc22@gmail.com",
    html,
  });
  return m.status === 200;
};

// console.log(
//   await send({
//     to: "jack@jackcrane.rocks",
//     text: {
//       name: "Jack Crane",
//       email: "jack@jackcrane.rocks",
//       phone: "5136289360",
//       age: "18",
//       shirtSize: "l",
//       jobs: {
//         expo: {
//           "629a930b94c8207a4adf532b": [
//             "629a930b94c8207a4adf5328",
//             "629a930b94c8207a4adf5329",
//             "629a930b94c8207a4adf532a",
//           ],
//         },
//       },
//     },
//     id: "629c252e4e7959197c18fb2f",
//   })
// );

export default send;
export { renderShifts, update };
