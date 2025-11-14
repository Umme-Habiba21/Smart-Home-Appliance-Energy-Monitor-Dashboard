const db = require("./database-service");

exports.handler = async (event, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  // Handle preflight requests
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    const deviceId = event.queryStringParameters?.deviceId;

    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Device ID is required" }),
      };
    }

    if (event.httpMethod === "GET") {
      // Get electricity rate
      const rate = await db.getElectricityRate(deviceId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ electricityRate: rate }),
      };
    }

    if (event.httpMethod === "POST") {
      const { rate } = JSON.parse(event.body);

      if (typeof rate !== "number" || rate < 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid rate value" }),
        };
      }

      // Update electricity rate
      await db.setElectricityRate(deviceId, rate);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: "Rate updated successfully" }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (error) {
    console.error("Settings error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
