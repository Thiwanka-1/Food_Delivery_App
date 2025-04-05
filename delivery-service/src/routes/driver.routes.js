import express from "express";
import { createDriver } from "../controllers/driver.controller.js";
import { verifyToken } from "../utils/verifyUser.js";

const router = express.Router();

// Create a new driver record
router.post("/add", createDriver);

// Get driver details by ID
router.get("/get/:id", getDriverById);

export default router;
