import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

// Health check — verifies both the API process and the DB connection
app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "unreachable", message: err.message });
  }
});

// Placeholder — real endpoints (courses, rounds, clubs, stats) are added in later phases
app.get("/api", (req, res) => {
  res.json({ name: "mobilcaddy-api", version: "0.1.0" });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`mobilcaddy-api listening on port ${port}`);
});
