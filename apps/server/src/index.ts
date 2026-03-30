import express from "express";
import { sessionsRouter } from "./routes/sessions.js";
import { agentsRouter } from "./routes/agents.js";
import { eventsRouter } from "./routes/events.js";
import { streamRouter } from "./routes/stream.js";
import { startLeaseSweeper } from "./jobs/leaseSweeper.js";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT) || 3000;

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/sessions", sessionsRouter);
app.use("/sessions/:sessionId/events", eventsRouter);
app.use("/sessions/:sessionId/stream", streamRouter);
app.use("/agents", agentsRouter);

const HOST = process.env.HOST ?? "0.0.0.0";
app.listen(PORT, HOST, () => {
  console.log(`Server listening on ${HOST}:${PORT}`);
  startLeaseSweeper();
});

export { app };
