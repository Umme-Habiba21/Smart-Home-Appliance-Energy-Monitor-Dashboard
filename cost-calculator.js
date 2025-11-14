// Default electricity rate (Bangladesh: 9.5 BDT/kWh - typical household rate with surcharges)
let electricityRate =
  parseFloat(localStorage.getItem("electricityRate")) || 9.5;

// Function to update electricity rate
function updateElectricityRate(rate) {
  rate = parseFloat(rate);
  if (rate >= 0) {
    electricityRate = rate;
    localStorage.setItem("electricityRate", rate.toString());
    // Update displayed costs
    updateCostDisplays();
  }
}

// Function to calculate cost for a given kWh usage
function calculateCost(kWh) {
  return kWh * electricityRate;
}

// Function to calculate daily cost from historical data
async function calculateDailyCost(deviceId, date = new Date()) {
  try {
    const startOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    const endOfDay = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1
    );

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

    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText}`);
      return 0;
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error("Invalid data format from API:", data);
      return 0;
    }

    const totalKWh = data.reduce((sum, reading) => sum + (reading.kWh || 0), 0);
    return calculateCost(totalKWh);
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("Daily cost calculation timed out");
    } else {
      console.error("Error calculating daily cost:", error);
    }
    return 0;
  }
}

// Function to calculate weekly cost
async function calculateWeeklyCost(deviceId) {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    const response = await fetch(
      `/.netlify/functions/store-energy-data?` +
        new URLSearchParams({
          deviceId,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
        }),
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`API Error: ${response.status} ${response.statusText}`);
      return 0;
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      console.error("Invalid data format from API:", data);
      return 0;
    }

    const totalKWh = data.reduce((sum, reading) => sum + (reading.kWh || 0), 0);
    return calculateCost(totalKWh);
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("Weekly cost calculation timed out");
    } else {
      console.error("Error calculating weekly cost:", error);
    }
    return 0;
  }
}

// Function to update all cost displays
async function updateCostDisplays() {
  // Check if currentDeviceId is defined and not null/empty
  if (typeof currentDeviceId === "undefined" || !currentDeviceId) {
    console.warn("updateCostDisplays called but no device selected");
    return;
  }

  try {
    // Update today's cost
    const todayCost = await calculateDailyCost(currentDeviceId);
    const todayCostElement = document.getElementById("today-cost");
    if (todayCostElement) {
      todayCostElement.textContent = `৳${todayCost.toFixed(2)}`;
    }

    // Update this week's cost
    const weekCost = await calculateWeeklyCost(currentDeviceId);
    const weekCostElement = document.getElementById("week-cost");
    if (weekCostElement) {
      weekCostElement.textContent = `৳${weekCost.toFixed(2)}`;
    }

    // Update rate display
    const rateElement = document.getElementById("electricity-rate");
    if (rateElement) {
      rateElement.value = electricityRate.toFixed(2);
    }
  } catch (error) {
    console.error("Error updating cost displays:", error);
  }
}

// Initialize electricity rate on page load
window.addEventListener("load", () => {
  const rateElement = document.getElementById("electricity-rate");
  if (rateElement) {
    rateElement.value = electricityRate.toFixed(2);
  }

  // Only update cost displays if currentDeviceId is defined
  if (typeof currentDeviceId !== "undefined" && currentDeviceId) {
    updateCostDisplays();
  }
});

// Debug function to check database data (open console and run: checkDatabaseData())
async function checkDatabaseData() {
  if (!currentDeviceId) {
    console.log("No device selected");
    return;
  }

  console.log("Checking database for device:", currentDeviceId);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(
      `/.netlify/functions/store-energy-data?` +
        new URLSearchParams({
          deviceId: currentDeviceId,
          startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          endTime: new Date().toISOString(),
        }),
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);

    const data = await response.json();
    console.log("Database response:", data);
    console.log("Total records:", Array.isArray(data) ? data.length : 0);

    if (Array.isArray(data) && data.length > 0) {
      const totalKWh = data.reduce(
        (sum, reading) => sum + (reading.kWh || 0),
        0
      );
      const totalCost = data.reduce(
        (sum, reading) => sum + (reading.cost || 0),
        0
      );
      console.log("Total kWh today:", totalKWh);
      console.log("Total cost today:", totalCost);
    }
  } catch (error) {
    console.error("Error checking database:", error);
  }
}
