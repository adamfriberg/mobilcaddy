import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(500).json({ status: "error", db: "unreachable", message: err.message });
  }
});

app.get("/api", (req, res) => {
  res.json({ name: "mobilcaddy-api", version: "0.2.0" });
});

app.get("/api/courses", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, name, location, par_total FROM courses ORDER BY name"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/courses/:id/holes", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, hole_number, par, length_meters, handicap_index,
              tee_lat, tee_lng,
              green_front_lat, green_front_lng,
              green_mid_lat, green_mid_lng,
              green_back_lat, green_back_lng
       FROM holes
       WHERE course_id = $1
       ORDER BY hole_number`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function requireAdminKey(req, res, next) {
  const key = req.header("x-admin-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

const COORD_FIELDS = [
  "tee_lat", "tee_lng",
  "green_front_lat", "green_front_lng",
  "green_mid_lat", "green_mid_lng",
  "green_back_lat", "green_back_lng",
];

app.put("/api/holes/:id/coords", requireAdminKey, async (req, res) => {
  const updates = [];
  const values = [];
  let i = 1;

  for (const field of COORD_FIELDS) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = $${i}`);
      values.push(req.body[field]);
      i++;
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: "no coordinate fields provided" });
  }

  values.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE holes SET ${updates.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "hole not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`mobilcaddy-api listening on port ${port}`);
});
