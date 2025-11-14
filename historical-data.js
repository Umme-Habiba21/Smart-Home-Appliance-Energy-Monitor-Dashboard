// Functions to fetch and display historical data
async function getHourlyData(deviceId, date = null) {
  try {
    // If date is provided, use it; otherwise use today
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    );
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(
      `/.netlify/functions/store-energy-data?` +
        new URLSearchParams({
          deviceId,
          startTime: startOfDay.toISOString(),
          endTime: endOfDay.toISOString(),
        }),
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("Hourly data fetch timeout");
    } else {
      console.error("Error fetching hourly data:", error);
    }
    return [];
  }
}

// Get aggregated stats for a specific time period
async function getAggregatedStats(deviceId, startTime, endTime) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(
      `/.netlify/functions/get-historical-data?` +
        new URLSearchParams({
          deviceId,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          type: "stats",
        }),
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error("Failed to fetch aggregated stats");
      return null;
    }

    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("Aggregated stats fetch timeout");
    } else {
      console.error("Error fetching aggregated stats:", error);
    }
    return null;
  }
}

// Function to update historical view based on selected timeframe
async function updateHistoricalView() {
  const timeframe = document.getElementById("history-timeframe").value;

  try {
    let statsData = null;
    let chartData = null;

    switch (timeframe) {
      case "today": {
        const today = new Date();
        const startOfDay = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );
        const now = new Date();

        // Get aggregated stats from database
        statsData = await getAggregatedStats(currentDeviceId, startOfDay, now);

        // Get hourly breakdown for charts
        chartData = await getHourlyData(currentDeviceId, today);
        break;
      }
      case "yesterday": {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const startOfYesterday = new Date(
          yesterday.getFullYear(),
          yesterday.getMonth(),
          yesterday.getDate()
        );
        const endOfYesterday = new Date(startOfYesterday);
        endOfYesterday.setDate(endOfYesterday.getDate() + 1);

        // Get aggregated stats from database
        statsData = await getAggregatedStats(
          currentDeviceId,
          startOfYesterday,
          endOfYesterday
        );

        // Get hourly breakdown for charts
        chartData = await getHourlyData(currentDeviceId, yesterday);
        break;
      }
      case "last7": {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);

        // Get aggregated stats from database
        statsData = await getAggregatedStats(
          currentDeviceId,
          startDate,
          endDate
        );

        // Get daily breakdown for charts from database
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(
            `/.netlify/functions/get-historical-data?` +
              new URLSearchParams({
                deviceId: currentDeviceId,
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                type: "daily",
              }),
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (response.ok) {
            chartData = await response.json();
          }
        } catch (error) {
          console.error("Error fetching daily breakdown for last7:", error);
        }
        break;
      }
      case "last30": {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);

        // Get aggregated stats from database
        statsData = await getAggregatedStats(
          currentDeviceId,
          startDate,
          endDate
        );

        // Get daily breakdown for charts from database
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch(
            `/.netlify/functions/get-historical-data?` +
              new URLSearchParams({
                deviceId: currentDeviceId,
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString(),
                type: "daily",
              }),
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (response.ok) {
            chartData = await response.json();
          }
        } catch (error) {
          console.error("Error fetching daily breakdown for last30:", error);
        }
        break;
      }
    }

    if (statsData) {
      // Update stats using database aggregation
      updateHistoricalStats(statsData);
    }

    // Always call updateHistoricalCharts, even with empty data to clear the charts
    updateHistoricalCharts(chartData || [], timeframe);
  } catch (error) {
    console.error("Error updating historical view:", error);
  }
}

// Function to update historical charts
function updateHistoricalCharts(data, timeframe) {
  if (!data) data = [];

  if (timeframe === "today" || timeframe === "yesterday") {
    // Update hourly pattern chart
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const values = Array(24).fill(0);

    if (Array.isArray(data) && data.length > 0) {
      data.forEach((entry) => {
        if (entry._id !== null && entry._id !== undefined) {
          values[entry._id] = entry.avgWatts || 0;
        }
      });
    }

    patternsChart.data.labels = hours;
    patternsChart.data.datasets[0].data = values;
    patternsChart.update();
  } else {
    // Update daily pattern chart
    let labels = [];
    let values = [];

    if (Array.isArray(data) && data.length > 0) {
      labels = data.map((entry) => {
        if (entry._id && entry._id.year && entry._id.month && entry._id.day) {
          return new Date(
            entry._id.year,
            entry._id.month - 1,
            entry._id.day
          ).toLocaleDateString();
        }
        return "";
      });
      values = data.map((entry) => entry.avgWatts || 0);
    }

    patternsChart.data.labels = labels;
    patternsChart.data.datasets[0].data = values;
    patternsChart.update();
  }
}

// Function to update historical statistics from aggregated database data
function updateHistoricalStats(statsData) {
  let totalKWh = 0;
  let totalCost = 0;
  let maxWatts = 0;
  let avgWatts = 0;

  if (statsData) {
    // statsData comes directly from database aggregation
    totalKWh = statsData.totalKWh || 0;
    totalCost = statsData.totalCost || 0;
    maxWatts = statsData.maxWatts || 0;
    avgWatts = statsData.avgWatts || 0;
  }

  // Update the UI elements
  document.getElementById("peak-usage").textContent = `${maxWatts.toFixed(1)}W`;
  document.getElementById("avg-usage").textContent = `${avgWatts.toFixed(1)}W`;
  document.getElementById("total-usage").textContent = `${totalKWh.toFixed(
    3
  )} kWh`;
  document.getElementById("total-cost").textContent = `৳${totalCost.toFixed(
    2
  )}`;
}

function updateSummaryChart(data, timeframe) {
  console.log("=== DEBUG SUMMARY CHART ===");
  console.log("Timeframe:", timeframe);
  console.log("Raw data:", data);
  console.log("Data type:", typeof data);
  console.log("Is array:", Array.isArray(data));

  if (data && Array.isArray(data)) {
    console.log("Data length:", data.length);
    if (data.length > 0) {
      console.log("First data entry:", data[0]);
      console.log("Sample entries:", data.slice(0, 3));
    }
  }

  if (!data) data = [];

  let labels = [];
  let values = [];

  if (timeframe === "today" || timeframe === "yesterday") {
    // Show hourly data
    const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`);
    const hourlyValues = Array(24).fill(0);

    console.log("Processing hourly data...");
    console.log("Hourly values array length:", hourlyValues.length);

    if (Array.isArray(data) && data.length > 0) {
      console.log("Processing", data.length, "data entries for hourly chart");
      data.forEach((entry, index) => {
        console.log(`Entry ${index}:`, entry);
        if (entry._id !== null && entry._id !== undefined) {
          const hourIndex = entry._id;
          const wattValue = entry.avgWatts || 0;
          console.log(`  Hour ${hourIndex}: ${wattValue}W`);
          if (hourIndex >= 0 && hourIndex < 24) {
            hourlyValues[hourIndex] = wattValue;
          } else {
            console.warn(`Invalid hour index: ${hourIndex}`);
          }
        } else {
          console.warn(`Entry ${index} has invalid _id:`, entry._id);
        }
      });
    }

    console.log("Final hourly values:", hourlyValues);
    labels = hours;
    values = hourlyValues;
  } else {
    // Show daily data for last7 or last30
    console.log("Processing daily data...");

    if (Array.isArray(data) && data.length > 0) {
      labels = data.map((entry, index) => {
        console.log(`Daily entry ${index}:`, entry);
        if (entry._id && entry._id.year && entry._id.month && entry._id.day) {
          const date = new Date(
            entry._id.year,
            entry._id.month - 1,
            entry._id.day
          );
          return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        }
        return "";
      });

      values = data.map((entry, index) => {
        const value = entry.avgWatts || 0;
        console.log(`Daily value ${index}: ${value}W`);
        return value;
      });

      console.log("Final daily labels:", labels);
      console.log("Final daily values:", values);
    } else {
      console.log("No daily data available");
    }
  }

  // Update the summary chart
  if (typeof summaryChart !== "undefined" && summaryChart) {
    console.log("Updating summary chart...");
    console.log("Chart labels:", labels);
    console.log("Chart values:", values);

    summaryChart.data.labels = labels;
    summaryChart.data.datasets[0].data = values;
    summaryChart.update();

    console.log("Chart updated successfully!");
  } else {
    console.error("Summary chart not found or not initialized!");
  }
}
