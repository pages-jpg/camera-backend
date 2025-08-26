const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());

// ✅ Connect to PostgreSQL (Render gives DATABASE_URL env variable)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ✅ Auto-create table if it doesn’t exist
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media (
        id SERIAL PRIMARY KEY,
        filename TEXT UNIQUE,
        filedata BYTEA,
        mimetype TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log("✅ media table ready");
  } catch (err) {
    console.error("❌ Error ensuring table:", err);
  }
})();

// Multer: store in memory before saving to DB
const upload = multer({ storage: multer.memoryStorage() });

// 📸 Upload file
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const safeName = `${Date.now()}-${req.file.originalname.replace(/\s+/g, "_")}`;
    await pool.query(
      "INSERT INTO media(filename, filedata, mimetype) VALUES($1,$2,$3)",
      [safeName, req.file.buffer, req.file.mimetype]
    );
    res.json({ success: true, file: safeName });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// 📂 List all filenames
app.get("/files", async (_req, res) => {
  try {
    const q = await pool.query("SELECT filename FROM media ORDER BY created_at DESC, id DESC");
    res.json(q.rows.map(r => r.filename));
  } catch (err) {
    console.error("Fetch list failed:", err);
    res.status(500).json({ error: "Failed to fetch files" });
  }
});

// 🖼️ Serve file
app.get("/uploads/:filename", async (req, res) => {
  try {
    const q = await pool.query("SELECT filedata, mimetype FROM media WHERE filename=$1", [req.params.filename]);
    if (q.rows.length === 0) return res.status(404).send("Not found");
    res.set("Content-Type", q.rows[0].mimetype || "application/octet-stream");
    res.send(q.rows[0].filedata);
  } catch (err) {
    console.error("Fetch file failed:", err);
    res.status(500).send("Error fetching file");
  }
});

// 🗑️ Delete file
app.delete("/delete/:filename", async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM media WHERE filename=$1", [req.params.filename]);
    if (r.rowCount === 0) return res.status(404).json({ error: "File not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// Root check
app.get("/", (_req, res) => {
  res.send("📸 Camera Backend with PostgreSQL is running");
});

app.listen(PORT, () => console.log(`🚀 Backend running on port ${PORT}`));
