const express = require("express");
const router = express.Router();
const pool = require("../db");
// upload
const multer = require("multer");
const path = require("path");

// ==========================================
// 1. LOGIC GAME
// ==========================================
const checkAho = (number, specialNum) => {
  const isMultiple = number % specialNum === 0;
  const hasDigit = String(number).includes(String(specialNum));

  return isMultiple || hasDigit;
};

// ==========================================
// 2. API: GET GAME DATA
// ==========================================
router.get("/game-data", async (req, res) => {
  try {
    // Get data from DB
    const result = await pool.query("SELECT * FROM game_config WHERE id = 1");

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Config not found (Please run seed.js)" });
    }

    const config = result.rows[0];
    const {
      start_num,
      end_num,
      special_num,
      magic_word,
      aho_text,
      aho_image_url,
      aho_sound_url,
    } = config;

    // Sequence Generation
    const sequence = [];

    for (let i = start_num; i <= end_num; i++) {
      const isAho = checkAho(i, special_num);

      const stepData = {
        step: i,
        value: String(i), // default number as string
        is_aho: isAho,
        assets: {}, // default empty assets
      };

      // if Aho, add assets
      if (isAho) {
        if (aho_text) stepData.assets.text = aho_text;
        if (aho_image_url) stepData.assets.image = aho_image_url;
        if (aho_sound_url) stepData.assets.sound = aho_sound_url;
      }

      sequence.push(stepData);
    }

    // Add Ending Word
    sequence.push({
      step: end_num + 1,
      value: magic_word,
      is_aho: true,
      assets: {
        sound:
          "https://www.myinstants.com/media/sounds/meme-de-creditos-finales.mp3",
      },
    });

    // response
    res.json({
      config: {
        start: start_num,
        end: end_num,
        special_num: special_num,
        magic_word: magic_word,
        aho_text: aho_text,
        aho_image_url: aho_image_url,
        aho_sound_url: aho_sound_url,
      },
      sequence: sequence,
    });
  } catch (err) {
    console.error("GET Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// ==========================================
// 3. Update Game Settings
// ==========================================
router.put("/settings", async (req, res) => {
  try {
    const {
      start_num,
      end_num,
      special_num,
      magic_word,
      aho_text,
      aho_image_url,
      aho_sound_url,
    } = req.body;

    // validation
    if (!start_num || !end_num || !special_num) {
      return res
        .status(400)
        .json({ error: "Start, End, and Special Num are required" });
    }
    if (Number(start_num) >= Number(end_num)) {
      return res
        .status(400)
        .json({ error: "Start Number must be smaller than End Number" });
    }
    if (Number(special_num) <= 0) {
      return res
        .status(400)
        .json({ error: "Special Number must be greater than 0" });
    }

    // Update DB
    const query = `
      UPDATE game_config
      SET 
        start_num = $1, 
        end_num = $2, 
        special_num = $3, 
        magic_word = $4,
        aho_text = $5,
        aho_image_url = $6,
        aho_sound_url = $7
      WHERE id = 1
      RETURNING *;
    `;

    const values = [
      start_num,
      end_num,
      special_num,
      magic_word,
      aho_text || null,
      aho_image_url || null,
      aho_sound_url || null,
    ];

    const result = await pool.query(query, values);

    res.json({
      message: "Settings updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("PUT Error:", err);
    res.status(500).json({ error: "Database Update Error" });
  }
});

// ==========================================
// 4. Upload file
// ==========================================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Save to folder uploads
  },
  filename: function (req, file, cb) {
    // file name: time + name
    cb(null, Date.now() + "-" + file.originalname);
  },
});

// router.use("/uploads", express.static(path.join(__dirname, "uploads")));
const upload = multer({ storage: storage });

// --- API UPLOAD FILE ---
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  // const fileUrl = `http://localhost:4000/uploads/${req.file.filename}`;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;

  const host = req.get("host");
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

module.exports = router;
