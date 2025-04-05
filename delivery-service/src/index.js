// src/index.js
import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import driverRoutes from "./routes/driver.routes.js";

dotenv.config();
const app = express();

// ── Middleware ─────────────────────────────────
app.use(express.json());
app.use(cookieParser());
app.use(cors());

// ── MongoDB Connection ─────────────────────────
mongoose
  .connect(process.env.MONGO_DELIVERY, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    process.exit(1);
  });

// ── Start Server ───────────────────────────────
const PORT = process.env.PORT || 3003;
server.listen(PORT, () => {
  console.log(`Delivery Service running on port ${PORT}`);
});
