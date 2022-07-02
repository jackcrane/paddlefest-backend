import express from "express";
const app = express();
const port = 3001;
import cors from "cors";

// import * as Sentry from "@sentry/node";
// import * as Tracing from "@sentry/tracing";

// Sentry.init({
//   dsn: "https://8129d1c8914b425a843a4f64bfa7accc@o1104565.ingest.sentry.io/6528722",
//   integrations: [
//     // enable HTTP calls tracing
//     new Sentry.Integrations.Http({ tracing: true }),
//     // enable Express.js middleware tracing
//     new Tracing.Integrations.Express({ app }),
//   ],

//   // Set tracesSampleRate to 1.0 to capture 100%
//   // of transactions for performance monitoring.
//   // We recommend adjusting this value in production
//   tracesSampleRate: 1.0,
// });

// app.use(Sentry.Handlers.requestHandler());
// app.use(Sentry.Handlers.tracingHandler());

import { OpenConnection, ObjectId } from "./util/mongo-handler.js";

import AppIntegration from "./express-components/app-integration.js";
import Admin from "./express-components/admin.js";
import Volunteer from "./express-components/volunteer.js";

app.use(
  express.urlencoded({
    extended: false,
    limit: "100mb",
    parameterLimit: 1000000,
  })
);

app.use(cors());

app.use(express.json());

app.use(AppIntegration);
app.use(Admin);
app.use(Volunteer);

app.get("/version", (req, res) => {
  res.json({ version: process.env.VERSION });
});

// app.use(Sentry.Handlers.errorHandler());

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
