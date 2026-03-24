import express from "express";
import type { SessionStatus } from "@humanlayer/shared";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;

app.get("/health", (_req, res) => {
  const status: SessionStatus = "created";
  res.json({ status, server: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

export { app };
