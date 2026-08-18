import "dotenv/config";
// Must load before any route files run — patches Express's router so that a
// rejected promise inside an `async (req, res) => {...}` handler reaches the
// error middleware below instead of hanging the request forever (Express 4
// doesn't do this on its own; that's an Express 5 feature).
import "express-async-errors";
import { createApp } from "./app";
import { startScheduler } from "./jobs/scheduler";

const app = createApp();

const port = Number(process.env.PORT) || 4000;
const onListening = () => {
  console.log(`Zentinel backend listening on :${port}`);
  startScheduler();
};

app.listen(port, onListening);
