const express = require("express");
const cors = require("cors");
const pool = require("./localdb");
require("dotenv").config();

// upload
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = 4000;

// Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json()); // Read JSON bodies

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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
const upload = multer({ storage: storage });

// --- API UPLOAD FILE ---
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).send("No file uploaded.");
  }
  // const fileUrl = `http://localhost:4000/uploads/${req.file.filename}`;
  // --- SỬA ĐOẠN NÀY ---
  // Tự động lấy giao thức (http hoặc https)
  // Render thường dùng proxy nên cần kiểm tra header 'x-forwarded-proto' trước
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;

  // Tự động lấy tên domain (localhost:4000 hoặc app.onrender.com)
  const host = req.get("host");

  // Ghép lại thành đường dẫn hoàn chỉnh
  const fileUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

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
app.get("/api/game-data", async (req, res) => {
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
app.put("/api/settings", async (req, res) => {
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
// 4. Comments API
// ==========================================

/* ===================================================
   1. API: (User Login/Register)
   Flow: Validate -> UPSERT (Insert or Update) -> Return
   =================================================== */
app.post("/api/login", async (req, res) => {
  const { line_user_id, display_name, picture_url } = req.body;

  // 1. Validate
  if (!line_user_id) {
    return res.status(400).json({ message: "Missing line_user_id" });
  }

  try {
    // 2. DB Upsert (Nếu có thì update, chưa có thì insert)
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

/* ===================================================
   2. API: Get Comments
   Flow: Validate -> Get Viewer ID -> Main Query
   =================================================== */
app.get("/api/comments", async (req, res) => {
  const { line_user_id } = req.headers;
  const { limit = 10, offset = 0, sort = "newest" } = req.query;

  const limitNum = parseInt(limit);
  const offsetNum = parseInt(offset);

  // validate limit & offset
  if (isNaN(limitNum) || limitNum < 0 || isNaN(offsetNum) || offsetNum < 0) {
    return res.status(400).json({ message: "Invalid limit or offset" });
  }
  // ----------------------------

  try {
    // 1. get Viewer ID
    let viewerId = null;
    if (line_user_id) {
      const userRes = await pool.query(
        "SELECT id FROM users WHERE line_user_id = $1",
        [line_user_id],
      );
      if (userRes.rows.length > 0) viewerId = userRes.rows[0].id;
      else return res.status(401).json({ message: "User not found" });
    }

    // 2. Main Query
    const orderBy =
      sort === "top"
        ? "like_count DESC, c.created_at DESC"
        : "c.created_at DESC";

    const query = `
      SELECT
        c.id, c.content, c.created_at, c.updated_at,
        u.display_name, u.picture_url,
        (SELECT COUNT(*) FROM likes WHERE comment_id = c.id)::int AS like_count,
        (SELECT COUNT(*) FROM comments WHERE parent_id = c.id)::int AS reply_count,
        EXISTS(SELECT 1 FROM likes WHERE comment_id = c.id AND user_id = $1) AS is_liked,
        (c.user_id = $1) AS is_owner,
        (c.created_at < c.updated_at) AS is_edited
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.parent_id IS NULL
      ORDER BY ${orderBy}
      LIMIT $2 OFFSET $3
    `;

    const result = await pool.query(query, [viewerId, limitNum, offsetNum]);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ===================================================
   3. API: Post Comment
   Flow: Validate -> Get User ID -> Insert Comment -> Response
   =================================================== */
app.post("/api/comments", async (req, res) => {
  const { line_user_id, content, parent_id } = req.body;

  // 1. Validate
  if (!content || content.length > 100) {
    return res.status(400).json({ message: "Content is empty or too long" });
  }

  try {
    // 2. Get User ID
    const userRes = await pool.query(
      "SELECT id, display_name, picture_url FROM users WHERE line_user_id = $1",
      [line_user_id],
    );

    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: "User not found" });
    }
    const user = userRes.rows[0];

    // 3. Insert Comment
    const insertQuery = `
      INSERT INTO comments (user_id, parent_id, content, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, content, created_at, updated_at;
    `;
    const result = await pool.query(insertQuery, [
      user.id,
      parent_id || null,
      content,
    ]);
    const newComment = result.rows[0];

    // 4. Response
    res.status(201).json({
      ...newComment,
      display_name: user.display_name,
      picture_url: user.picture_url,
      like_count: 0,
      reply_count: 0,
      is_liked: false,
      is_owner: true,
      is_edited: false,
    });
  } catch (err) {
    console.error(err);
    if (err.code === "23503")
      return res.status(404).json({ message: "Parent comment not found" });
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ===================================================
   4. API: Edit Comment
   Flow: Validate -> Get User ID -> Update if Owner -> Check Result
   =================================================== */
app.put("/api/comments/:comment_id", async (req, res) => {
  const { comment_id } = req.params;
  const { line_user_id, content } = req.body;

  // 1. Validate
  if (!content || content.length > 100) {
    return res.status(400).json({ message: "Content is empty or too long" });
  }

  try {
    // 2. Get User ID
    const userRes = await pool.query(
      "SELECT id FROM users WHERE line_user_id = $1",
      [line_user_id],
    );
    if (userRes.rows.length === 0)
      return res.status(401).json({ message: "User not found" });
    const userId = userRes.rows[0].id;

    // 3. Update if Owner
    const updateQuery = `
      UPDATE comments
      SET content = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING id, content, updated_at, (created_at < updated_at) as is_edited
    `;
    const result = await pool.query(updateQuery, [content, comment_id, userId]);

    // 4. Check Result
    if (result.rows.length === 0) {
      // Can't find comment or not owner
      return res
        .status(403)
        .json({ message: "Permission denied or Comment not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ===================================================
   5. (Delete Comment)
   Flow: Validate -> Get User ID -> Delete if Owner -> Check Result
   =================================================== */
app.delete("/api/comments/:comment_id", async (req, res) => {
  const { comment_id } = req.params;
  const { line_user_id } = req.headers; // Get user ID from headers for authentication

  try {
    // 2. Get User ID
    const userRes = await pool.query(
      "SELECT id FROM users WHERE line_user_id = $1",
      [line_user_id],
    );
    if (userRes.rows.length === 0)
      return res.status(401).json({ message: "User not found" });
    const userId = userRes.rows[0].id;

    // 3. Delete
    const deleteQuery = `
      DELETE FROM comments
      WHERE id = $1 AND user_id = $2
    `;
    const result = await pool.query(deleteQuery, [comment_id, userId]);

    // 4. Check Result
    if (result.rowCount === 0) {
      return res
        .status(403)
        .json({ message: "Permission denied or Comment not found" });
    }

    res.json({ message: "Deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ===================================================
   6. (Get Replies)
   Flow: Get Comments  WHERE parent_id = ?
   =================================================== */
app.get("/api/comments/:comment_id/replies", async (req, res) => {
  const { comment_id } = req.params; // Parent ID
  const { line_user_id } = req.headers;
  const { limit = 10, offset = 0 } = req.query;

  try {
    // 1. Get Viewer ID
    const parentCheck = await pool.query(
      "SELECT 1 FROM comments WHERE id = $1",
      [comment_id],
    );
    if (parentCheck.rows.length === 0) {
      return res.status(404).json({ message: "Parent comment not found" });
    }

    let viewerId = null;
    if (line_user_id) {
      const userRes = await pool.query(
        "SELECT id FROM users WHERE line_user_id = $1",
        [line_user_id],
      );
      if (userRes.rows.length > 0) viewerId = userRes.rows[0].id;
      else return res.status(401).json({ message: "User not found" });
    }

    // 2. Main Query (Sort ASC)
    const query = `
      SELECT
        c.id, c.content, c.created_at, c.updated_at,
        u.display_name, u.picture_url,
        (SELECT COUNT(*) FROM likes WHERE comment_id = c.id)::int AS like_count,
        0 AS reply_count, 
        EXISTS(SELECT 1 FROM likes WHERE comment_id = c.id AND user_id = $1) AS is_liked,
        (c.user_id = $1) AS is_owner,
        (c.created_at < c.updated_at) AS is_edited
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.parent_id = $2
      ORDER BY c.created_at ASC
      LIMIT $3 OFFSET $4
    `;

    const result = await pool.query(query, [
      viewerId,
      comment_id,
      limit,
      offset,
    ]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/* ===================================================
   7. API: Toggle Like (Like / Unlike)
   Flow: Get User & Status -> IF (Backend Logic) -> Exec -> Return Count
   =================================================== */
app.post("/api/comments/:comment_id/like", async (req, res) => {
  const { comment_id } = req.params;
  const { line_user_id } = req.body;

  try {
    // 1. Get User ID & Check Current Like Status
    const checkQuery = `
      SELECT 
        id as user_id,
        EXISTS(SELECT 1 FROM likes WHERE comment_id = $1 AND user_id = users.id) as is_liked
      FROM users WHERE line_user_id = $2
    `;
    const checkRes = await pool.query(checkQuery, [comment_id, line_user_id]);

    if (checkRes.rows.length === 0)
      return res.status(401).json({ message: "User not found" });

    const { user_id, is_liked } = checkRes.rows[0];

    // 2. Logic If/Else (Split Query)
    if (is_liked) {
      // Case A: like -> Unlike
      await pool.query(
        "DELETE FROM likes WHERE comment_id = $1 AND user_id = $2",
        [comment_id, user_id],
      );
    } else {
      // Case B: unlike -> Like
      try {
        await pool.query(
          "INSERT INTO likes (comment_id, user_id) VALUES ($1, $2)",
          [comment_id, user_id],
        );
      } catch (e) {
        if (e.code === "23503")
          return res.status(404).json({ message: "Comment not found" }); // Foreign key violation
        throw e;
      }
    }

    // 3. Return Latest Count
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM likes WHERE comment_id = $1",
      [comment_id],
    );

    res.json({
      is_liked: !is_liked,
      like_count: parseInt(countRes.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
