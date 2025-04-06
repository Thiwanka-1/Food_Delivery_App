import Driver from "../models/driver.model.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();
// Create a new driver record
export const createDriver = async (req, res, next) => {
  try {
    const { userId, currentLocation, availability } = req.body;
    const newDriver = new Driver({ userId, currentLocation, availability });
    const savedDriver = await newDriver.save();
    res
      .status(201)
      .json({ message: "Driver created successfully", driver: savedDriver });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get driver details by ID
export const getDriverById = async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) {
      return res.status(404).json({ message: "Driver not found" });
    }
    res.json(driver);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const deg2rad = (deg) => deg * (Math.PI / 180);
const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) *
      Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export const getDriverByUserId = async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.params.userId });
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    res.json(driver);
  } catch (err) {
    console.error("getDriverByUserId error:", err);
    res.status(500).json({ message: err.message });
  }
};
