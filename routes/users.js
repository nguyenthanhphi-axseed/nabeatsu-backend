const express = require("express");
const router = express.Router();
const pool = require("../localdb");


/* ===================================================
   1. API: (User Login/Register)
   Flow: Validate -> UPSERT (Insert or Update) -> Return
   =================================================== */
router.post("/login", async (req, res) => {
  const { line_user_id, display_name, picture_url } = req.body;

  // 1. Validate
  if (!line_user_id) {
    return res.status(400).json({ message: "Missing line_user_id" });
  }

  try {
    // 2. DB Upsert
    const query = `
      INSERT INTO users (line_user_id, display_name, picture_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (line_user_id)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        picture_url = EXCLUDED.picture_url,
        updated_at = NOW()
      RETURNING *;
    `;
    const result = await pool.query(query, [
      line_user_id,
      display_name,
      picture_url,
    ]);

    // 3. Response
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;