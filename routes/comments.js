const express = require("express");
const router = express.Router();
const pool = require("../localdb");

// ==========================================
// 4. Comments API
// ==========================================

/* ===================================================
   2. API: Get Comments
   Flow: Validate -> Get Viewer ID -> Main Query
   =================================================== */
router.get("/", async (req, res) => {
  const { line_user_id } = req.headers;
  const { limit = 10, offset = 0, sort = "newest" } = req.query;

  if (isNaN(parseInt(limit)) || isNaN(parseInt(offset))) {
    return res.status(400).json({ message: "Invalid limit or offset" });
  }

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
        CASE WHEN c.user_id = $1 THEN TRUE ELSE FALSE END AS is_owner,
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
router.post("/", async (req, res) => {
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
router.put("/:comment_id", async (req, res) => {
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
router.delete("/:comment_id", async (req, res) => {
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
router.get("/:comment_id/replies", async (req, res) => {
  const { comment_id } = req.params; // Parent ID
  const { line_user_id } = req.headers;
  const { limit = 10, offset = 0 } = req.query;

  if (isNaN(parseInt(limit)) || isNaN(parseInt(offset))) {
    return res.status(400).json({ message: "Invalid limit or offset" });
  }

  const limitNum = parseInt(limit);
  const offsetNum = parseInt(offset);

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
    }
    // else return res.status(401).json({ message: "User not found" });

    // 2. Main Query (Sort ASC)
    const query = `
      SELECT
        c.id, c.content, c.created_at, c.updated_at,
        u.display_name, u.picture_url,
        (SELECT COUNT(*) FROM likes WHERE comment_id = c.id)::int AS like_count,
        0 AS reply_count, 
        EXISTS(SELECT 1 FROM likes WHERE comment_id = c.id AND user_id = $1) AS is_liked,
        CASE WHEN c.user_id = $1 THEN TRUE ELSE FALSE END AS is_owner,
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
      limitNum,
      offsetNum,
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
router.post("/:comment_id/like", async (req, res) => {
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

module.exports = router;