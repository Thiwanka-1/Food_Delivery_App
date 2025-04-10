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

export const assignDriverToOrder = async (req, res) => {
  try {
    // 1) Normalize orderId
    let { orderId } = req.body;
    if (typeof orderId !== "string") orderId = orderId.toString();

    // 2) Build auth config for inter-service calls
    const token =
      req.cookies?.access_token ||
      req.headers.authorization?.split(" ")[1] ||
      "";
    const authConfig = { headers: { Cookie: `access_token=${token}` } };

    // 3) Fetch order
    const ORDER_URL = process.env.ORDER_SERVICE_URL;
    const { data: order } = await axios.get(
      `${ORDER_URL}/get/${orderId}`,
      authConfig
    );
    if (!order) return res.status(404).json({ message: "Order not found" });

    // 4) Fetch restaurant
    const REST_URL = process.env.RESTAURANT_SERVICE_URL;
    const { data: restaurant } = await axios.get(
      `${REST_URL}/getid/${order.restaurantId}`,
      authConfig
    );
    const { latitude: restLat, longitude: restLon } = restaurant.location;
    const ownerId = restaurant.owner_id;

    // 5) Find available drivers
    const drivers = await Driver.find({ availability: "available" });
    const withDist = drivers.map((d) => ({
      driver: d,
      distance: getDistanceFromLatLonInKm(
        restLat,
        restLon,
        d.currentLocation.latitude,
        d.currentLocation.longitude
      ),
    }));

    // 6) Filter & sort
    let nearby = withDist.filter((d) => d.distance <= 10);
    if (!nearby.length) nearby = withDist;
    nearby.sort((a, b) => {
      if (a.distance === b.distance) {
        return (
          (a.driver.deliveriesCount || 0) - (b.driver.deliveriesCount || 0)
        );
      }
      return a.distance - b.distance;
    });

    const selected = nearby[0]?.driver;
    if (!selected) throw new Error("No available driver");

    // 7) Update order status
    await axios.patch(
      `${ORDER_URL}/${orderId}/status`,
      { status: "driver_assigned", driverId: selected._id },
      authConfig
    );

    // 8) Mark driver busy + assign order
    selected.availability = "busy";
    selected.activeOrderId = orderId;
    selected.nearAlertSent = false;
    selected.deliveriesCount += 1;
    await selected.save();

    // 9) Broadcast via Socket.IO
    const io = req.app.locals.io;
    if (io) {
      io.emit("driverAssigned", {
        orderId,
        driverId: selected._id,
        currentLocation: selected.currentLocation,
      });
    }

    const USER_URL = process.env.USER_SERVICE_URL;
    const NOTIF_URL = process.env.NOTIFICATION_SERVICE_URL;

    // fetch all three user records in parallel
    const [{ data: customer }, { data: driverUser }, { data: ownerUser }] =
      await Promise.all([
        axios.get(`${USER_URL}/${order.userId}`, authConfig),
        axios.get(`${USER_URL}/${selected.userId}`, authConfig),
        axios.get(`${USER_URL}/${ownerId}`, authConfig),
      ]);

    // helper to catch but not throw
    const safePost = (url, body) =>
      axios.post(url, body, authConfig).catch(console.error);

    // ––––– Customer –––––
    const custText = `A driver is on the way for your order ${orderId}.`;
    await Promise.all([
      // email
      safePost(`${NOTIF_URL}/email`, {
        to: customer.email,
        subject: `Driver is assigned for Order ${orderId}`,
        text: custText,
        type: "driver_assigned",
        payload: { orderId, driverId: selected._id },
      }),
      // sms
      customer.phoneNumber
        ? safePost(`${NOTIF_URL}/sms`, {
            to: customer.phoneNumber,
            message: custText,
            type: "driver_assigned",
            payload: { orderId, driverId: selected._id },
          })
        : Promise.resolve(),
    ]);

    // ––––– Driver –––––
    const drvText = `Pick up order ${orderId} from ${restaurant.name}.`;
    await Promise.all([
      safePost(`${NOTIF_URL}/email`, {
        to: driverUser.email,
        subject: `New assignment: Order ${orderId}`,
        text: drvText,
        type: "driver_assigned",
        payload: { orderId },
      }),
      driverUser.phoneNumber
        ? safePost(`${NOTIF_URL}/sms`, {
            to: driverUser.phoneNumber,
            message: drvText,
            type: "driver_assigned",
            payload: { orderId },
          })
        : Promise.resolve(),
    ]);

    // ––––– Owner –––––
    const ownText = `A driver has been assigned to order ${orderId}.`;
    await Promise.all([
      safePost(`${NOTIF_URL}/email`, {
        to: ownerUser.email,
        subject: `Driver assigned for Order ${orderId}`,
        text: ownText,
        type: "driver_assigned",
        payload: { orderId },
      }),
      ownerUser.phoneNumber
        ? safePost(`${NOTIF_URL}/sms`, {
            to: ownerUser.phoneNumber,
            message: ownText,
            type: "driver_assigned",
            payload: { orderId },
          })
        : Promise.resolve(),
    ]);

    return res.json({
      message: "Driver assigned successfully.",
      order,
      driver: selected,
    });
  } catch (error) {
    console.error("assignDriverToOrder error:", error);
    return res.status(500).json({ message: error.message });
  }
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
