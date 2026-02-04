// backend/seed.js
const pool = require("./db");

const seedData = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS game_config (
        id SERIAL PRIMARY KEY,
        start_num INTEGER DEFAULT 1,
        end_num INTEGER DEFAULT 41,
        special_num INTEGER DEFAULT 3,
        magic_word TEXT DEFAULT 'オモロー',
        aho_text TEXT,
        aho_image_url TEXT,
        aho_sound_url TEXT
      );
    `);
    console.log("Table created successfully");

    await pool.query(`
      UPDATE game_config
      SET end_num = 41, magic_word = 'オモロー'
      WHERE id = 1;
    `);
    console.log("Seed data inserted successfully");
  } catch (err) {
    console.error("Error seeding data:", err);
  } finally {
    pool.end();
  }
};

seedData();
