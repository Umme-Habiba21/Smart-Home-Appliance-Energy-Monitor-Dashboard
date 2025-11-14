const db = require("./database-service");

exports.handler = async (event, context) => {
  try {
    const { deviceId, type, startTime, endTime } =
      event.queryStringParameters || {};

    if (!deviceId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "deviceId is required" }),
      };
    }

    let data;
    switch (type) {
      case "hourly":
        // Get hourly aggregation for a specific date
        data = await db.getHourlyAggregation(
          deviceId,
          startTime ? new Date(startTime) : new Date()
        );
        break;

      case "daily":
        // Get daily aggregation between dates
        data = await db.getDailyAggregation(
          deviceId,
          startTime
            ? new Date(startTime)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Default to last 7 days
          endTime ? new Date(endTime) : new Date()
        );
        break;

      case "stats":
        // Get overall statistics
        data = await db.getDeviceStats(
          deviceId,
          startTime
            ? new Date(startTime)
            : new Date(Date.now() - 24 * 60 * 60 * 1000), // Default to last 24 hours
          endTime ? new Date(endTime) : new Date()
        );
        break;

      default:
        // Get raw readings
        data = await db.getReadings({
          deviceId,
          ...(startTime && endTime
            ? {
                timestamp: {
                  $gte: new Date(startTime),
                  $lte: new Date(endTime),
                },
              }
            : {}),
        });
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to process request" }),
    };
  } finally {
    await db.disconnect();
  }
};
