const { MongoClient } = require("mongodb");

class DatabaseService {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    if (this.client) return;

    try {
      this.client = await MongoClient.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      this.db = this.client.db("energy_monitor");
      console.log("Connected to MongoDB");
    } catch (error) {
      console.error("MongoDB connection error:", error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
    }
  }

  async storeReading(reading) {
    await this.connect();
    const readings = this.db.collection("energy_readings");

    const document = {
      deviceId: reading.deviceId,
      watts: reading.watts,
      kWh: reading.kWh,
      cost: reading.cost,
      timestamp: new Date(),
    };

    return await readings.insertOne(document);
  }

  async getReadings(query = {}, limit = 1000) {
    await this.connect();
    const readings = this.db.collection("energy_readings");

    return await readings
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
  }

  async getDeviceStats(deviceId, startTime, endTime) {
    await this.connect();
    const readings = this.db.collection("energy_readings");

    const match = {
      deviceId,
      timestamp: {
        $gte: new Date(startTime),
        $lte: new Date(endTime),
      },
    };

    const stats = await readings
      .aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalKWh: { $sum: "$kWh" },
            totalCost: { $sum: "$cost" },
            avgWatts: { $avg: "$watts" },
            maxWatts: { $max: "$watts" },
            readingCount: { $sum: 1 },
          },
        },
      ])
      .toArray();

    return stats[0] || null;
  }

  async getHourlyAggregation(deviceId, date) {
    await this.connect();
    const readings = this.db.collection("energy_readings");

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return await readings
      .aggregate([
        {
          $match: {
            deviceId,
            timestamp: {
              $gte: startOfDay,
              $lte: endOfDay,
            },
          },
        },
        {
          $group: {
            _id: { $hour: "$timestamp" },
            avgWatts: { $avg: "$watts" },
            totalKWh: { $sum: "$kWh" },
            totalCost: { $sum: "$cost" },
          },
        },
        {
          $sort: { _id: 1 },
        },
      ])
      .toArray();
  }

  async getDailyAggregation(deviceId, startDate, endDate) {
    await this.connect();
    const readings = this.db.collection("energy_readings");

    return await readings
      .aggregate([
        {
          $match: {
            deviceId,
            timestamp: {
              $gte: new Date(startDate),
              $lte: new Date(endDate),
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $year: "$timestamp" },
              month: { $month: "$timestamp" },
              day: { $dayOfMonth: "$timestamp" },
            },
            totalKWh: { $sum: "$kWh" },
            totalCost: { $sum: "$cost" },
            avgWatts: { $avg: "$watts" },
            maxWatts: { $max: "$watts" },
          },
        },
        {
          $sort: {
            "_id.year": 1,
            "_id.month": 1,
            "_id.day": 1,
          },
        },
      ])
      .toArray();
  }

  // Settings management
  async getElectricityRate(deviceId) {
    await this.connect();
    const settings = this.db.collection("device_settings");

    const result = await settings.findOne({
      deviceId,
      setting: "electricityRate",
    });

    return result ? result.value : 0.15; // Default rate if not set
  }

  async setElectricityRate(deviceId, rate) {
    await this.connect();
    const settings = this.db.collection("device_settings");

    // Using upsert to create if doesn't exist or update if exists
    return await settings.updateOne(
      {
        deviceId,
        setting: "electricityRate",
      },
      {
        $set: {
          value: rate,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  async getDeviceSettings(deviceId) {
    await this.connect();
    const settings = this.db.collection("device_settings");

    return await settings.find({ deviceId }).toArray();
  }
}

module.exports = new DatabaseService();
