const { Pool } = require("pg");
require("dotenv").config();

const commentsPool = new Pool({
  connectionString: process.env.COMMENTS_DB_URL,
  // Bắt buộc phải có ssl khi kết nối với Supabase/Cloud DB
  ssl: {
    rejectUnauthorized: false,
  },
});

module.exports = commentsPool;
