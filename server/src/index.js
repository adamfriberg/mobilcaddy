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
              image_url, tips,
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

async function getUserId() {
  const { rows } = await pool.query("SELECT id FROM users ORDER BY id LIMIT 1");
  if (rows.length === 0) throw new Error("no user seeded — run migrations");
  return rows[0].id;
}

async function getRoundScores(roundId) {
  const { rows } = await pool.query(
    "SELECT hole_id, strokes, putts, fairway_hit, green_in_regulation, miss_direction FROM hole_scores WHERE round_id = $1",
    [roundId]
  );
  const scores = {};
  rows.forEach((r) => {
    scores[r.hole_id] = {
      strokes: r.strokes,
      putts: r.putts,
      fairway_hit: r.fairway_hit,
      green_in_regulation: r.green_in_regulation,
      miss_direction: r.miss_direction,
    };
  });
  return scores;
}

app.get("/api/rounds/active", async (req, res) => {
  try {
    const courseId = req.query.course_id;
    if (!courseId) return res.status(400).json({ error: "course_id required" });
    const userId = await getUserId();
    const { rows } = await pool.query(
      `SELECT id, played_at FROM rounds
       WHERE course_id = $1 AND user_id = $2 AND finished = false
       ORDER BY played_at DESC LIMIT 1`,
      [courseId, userId]
    );
    if (rows.length === 0) return res.json(null);
    const round = rows[0];
    const scores = await getRoundScores(round.id);
    res.json({ id: round.id, played_at: round.played_at, scores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/rounds", async (req, res) => {
  try {
    const courseId = req.query.course_id;
    if (!courseId) return res.status(400).json({ error: "course_id required" });
    const userId = await getUserId();
    const { rows } = await pool.query(
      `SELECT r.id, r.played_at, r.finished,
              COALESCE(SUM(hs.strokes), 0)::int AS total_strokes,
              COALESCE(SUM(h.par) FILTER (WHERE hs.strokes IS NOT NULL), 0)::int AS total_par,
              COUNT(hs.hole_id)::int AS holes_played
       FROM rounds r
       LEFT JOIN hole_scores hs ON hs.round_id = r.id
       LEFT JOIN holes h ON h.id = hs.hole_id
       WHERE r.course_id = $1 AND r.user_id = $2
       GROUP BY r.id
       ORDER BY r.played_at DESC`,
      [courseId, userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/rounds/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, played_at, finished, course_id FROM rounds WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: "round not found" });
    const scores = await getRoundScores(req.params.id);
    res.json({ ...rows[0], scores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/rounds", async (req, res) => {
  try {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: "course_id required" });
    const userId = await getUserId();
    await pool.query(
      "UPDATE rounds SET finished = true WHERE course_id = $1 AND user_id = $2 AND finished = false",
      [course_id, userId]
    );
    const { rows } = await pool.query(
      "INSERT INTO rounds (user_id, course_id) VALUES ($1, $2) RETURNING id, played_at",
      [userId, course_id]
    );
    res.json({ id: rows[0].id, played_at: rows[0].played_at, scores: {} });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const HOLE_SCORE_FIELDS = ["strokes", "putts", "fairway_hit", "green_in_regulation", "miss_direction"];

app.put("/api/rounds/:roundId/holes/:holeId", async (req, res) => {
  try {
    const fields = HOLE_SCORE_FIELDS.filter((f) => req.body[f] !== undefined);
    if (fields.length === 0) return res.status(400).json({ error: "no fields provided" });
    if (req.body.strokes !== undefined && (!Number.isInteger(req.body.strokes) || req.body.strokes < 1)) {
      return res.status(400).json({ error: "strokes must be a positive integer" });
    }

    const cols = ["round_id", "hole_id", ...fields];
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const values = [req.params.roundId, req.params.holeId, ...fields.map((f) => req.body[f])];
    const updateSet = fields.map((f) => `${f} = EXCLUDED.${f}`).join(", ");

    await pool.query(
      `INSERT INTO hole_scores (${cols.join(", ")})
       VALUES (${placeholders.join(", ")})
       ON CONFLICT (round_id, hole_id) DO UPDATE SET ${updateSet}`,
      values
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/rounds/:roundId/holes/:holeId", async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM hole_scores WHERE round_id = $1 AND hole_id = $2",
      [req.params.roundId, req.params.holeId]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/clubs", async (req, res) => {
  try {
    const userId = await getUserId();
    const { rows } = await pool.query(
      "SELECT id, name, average_distance_m FROM clubs WHERE user_id = $1 ORDER BY average_distance_m DESC NULLS LAST, name",
      [userId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/clubs", async (req, res) => {
  try {
    const { name, average_distance_m } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const userId = await getUserId();
    const { rows } = await pool.query(
      "INSERT INTO clubs (user_id, name, average_distance_m) VALUES ($1, $2, $3) RETURNING id, name, average_distance_m",
      [userId, name, average_distance_m ?? null]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/clubs/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM clubs WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`mobilcaddy-api listening on port ${port}`);
});
