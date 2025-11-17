const { MongoClient } = require("mongodb");

console.log("MONGODB_URI exists?", !!process.env.MONGODB_URI);

// Get these from your Netlify environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = "energy_monitor";

// Cached database connection
let cachedClient = null;
let cachedDb = null;

// MongoDB connection options optimized for Netlify Functions
const mongoOptions = {
  connectTimeoutMS: 3000, // Reduced connection timeout
  socketTimeoutMS: 3000, // Reduced socket timeout
  serverSelectionTimeoutMS: 3000, // Reduced server selection timeout
  maxPoolSize: 1, // Optimized for serverless
  retryWrites: true, // Enable retry on write operations
  useUnifiedTopology: true,
  w: 1, // Basic write concern for faster operations
};

// Helper function to get database connection
async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  // Connect with timeout
  const client = await Promise.race([
    MongoClient.connect(MONGODB_URI, mongoOptions),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database connection timeout")), 3000)
    ),
  ]);

  const db = client.db(DB_NAME);

  // Cache the connection
  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

exports.handler = async (event, context) => {
  // Add CORS headers
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  // Only allow POST and GET methods
  if (event.httpMethod !== "POST" && event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  // Validate MongoDB URI
  if (!MONGODB_URI) {
    console.error("MongoDB URI is not configured");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Database configuration error" }),
    };
  }

  try {
    const { client, db } = await connectToDatabase();
    const readings = db.collection("energy_readings");

    if (event.httpMethod === "POST") {
      // Parse and validate data
      const data = JSON.parse(event.body);

      // Handle both single reading and batch readings
      const readingsToInsert = Array.isArray(data.readings)
        ? data.readings.map((r) => ({
            deviceId: r.deviceId,
            watts: r.watts,
            timestamp: new Date(r.timestamp || Date.now()),
            kWh: r.kWh,
            cost: r.cost,
          }))
        : [
            {
              deviceId: data.deviceId,
              watts: data.watts,
              timestamp: new Date(),
              kWh: data.kWh,
              cost: data.cost,
            },
          ];

      // Use bulk operation for better performance
      const result = await readings.insertMany(readingsToInsert, {
        ordered: false,
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Reading stored successfully" }),
      };
    } else {
      // GET request - retrieve historical data
      const { deviceId, startTime, endTime } =
        event.queryStringParameters || {};

      let query = {};

      if (deviceId) {
        query.deviceId = deviceId;
      }

      if (startTime || endTime) {
        query.timestamp = {};
        if (startTime) {
          query.timestamp.$gte = new Date(startTime);
        }
        if (endTime) {
          query.timestamp.$lte = new Date(endTime);
        }
      }

      console.log(
        "Query for device:",
        deviceId,
        "Query:",
        JSON.stringify(query)
      );

      const historicalData = await readings
        .find(query)
        .sort({ timestamp: -1 })
        .limit(1000)
        .toArray();

      console.log(
        `Found ${historicalData.length} readings for device ${deviceId}`
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(historicalData),
      };
    }
  } catch (error) {
    console.error("Database operation error:", error);
    let statusCode = 500;
    let errorMessage = "Internal server error";

    if (error.message.includes("timeout")) {
      statusCode = 504;
      errorMessage = "Database operation timed out";
    } else if (error.name === "MongoNetworkError") {
      statusCode = 503;
      errorMessage = "Database connection error";
    } else if (error.name === "MongoServerError") {
      statusCode = 502;
      errorMessage = "Database server error";
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: errorMessage,
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      }),
    };
  }
};
