const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();
const app = express();
const PORT = 4000;

// Import Routes
const userRoutes = require("./routes/users");
const commentRoutes = require("./routes/comments");
const nabeatsuRoutes = require("./routes/nabeatsu");

// Middleware
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json()); // Read JSON bodies

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/users", userRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api", nabeatsuRoutes);

// Start Server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
