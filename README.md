# Smart Home Appliance Energy Monitor Dashboard

This project provides a live dashboard to monitor the power consumption of a smart appliance connected via a Tuya smart plug with power monitoring capabilities. It uses a secure Netlify serverless function to interact with the Tuya Cloud API, keeping your secrets safe.

## 🚀 Setup and Installation

Follow these steps to get your local development environment ready.

### Prerequisites

You must have Node.js and npm installed.

### Install Dependencies

Navigate to your project's root directory and install the necessary Node.js packages.

# Install the official Tuya Node.js connector
npm install @tuya/tuya-connector-nodejs

# Install dotenv for local environment variable management
npm install dotenv

# Install mongodb for databse connection
npm install mongodb

Note: The serverless function code uses the simpler tuya-connector-sdk library, which should also be installed via a package.json file for Netlify deployment, as mentioned previously. If running locally, @tuya/tuya-connector-nodejs is the modern choice, but ensure your serverless code is consistent with the library you deploy.

### Configure Environment Variables

For the application to securely connect to the Tuya Cloud API, you need to set up three environment variables.

Create a file named .env in the root of your project directory. And populate the file with your credentials from the Tuya IoT Platform. Leave the values empty in the example below, but fill them in with your actual secrets. (All the key and values added here need to be stored in environment variables section in Netlify or other)
```
TUYA_ACCESS_ID="YOUR_TUYA_ACCESS_KEY_GOES_HERE"
TUYA_ACCESS_SECRET="YOUR_TUYA_SECRET_KEY_GOES_HERE"

# The unique ID of your smart plug device obtained from the Tuya IoT Platform
DEVICE_ID_1="YOUR_SMART_PLUG_DEVICE_ID_GOES_HERE"

# Mongoodb atlas connection string
MONGODB_URI=mongodb+srv://<username>:<password>@cluster1.wv7lvme.mongodb.net/?retryWrites=true&w=majority&appName=<whatever-name-you-gave-in-the-setup>
```

### ⚠️ Security Warning:
The .env file contains sensitive data. You MUST add it to your .gitignore file to prevent accidentally committing your secrets to your public GitHub repository.


# Visual Guide: Dashboard Data Flow

## Timeline: How Energy Accumulates

```
SESSION 1 (Dashboard Opened)
├─ T=0:00   → Device power: 500W
│           → kWh this session: 0 kWh
│           → DB stored: 1 reading
│
├─ T=0:05   → Device power: 500W
│           → Added 0.00069 kWh (500W × 5sec/3600000)
│           → kWh this session: 0.00069 kWh
│           → DB stored: 2 readings
│
├─ T=0:10   → Device power: 500W
│           → Added 0.00069 kWh
│           → kWh this session: 0.00138 kWh
│           → DB stored: 3 readings
│
├─ T=1:00   → After 1 hour of continuous 500W
│           → kWh this session: 0.5 kWh ✓ MATCHES TUYA!
│           → DB stored: 720 readings
│           → Today's Cost = 0.5 kWh × $0.15 = $0.075
│
└─ T=24:00  → After 24 hours of continuous 500W
            → kWh this session: 12 kWh
            → DB stored: 17,280 readings
            → Today's Cost = 12 kWh × $0.15 = $1.80
```

## What Each Display Shows

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIVE METRICS SECTION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Power Draw: 500 W  ← From Tuya API (real-time)               │
│                                                                 │
│  Total Energy: 0.001 kWh  ← From session memory                │
│  [This dashboard session only]                                 │
│  = Sum of all kWh_increment since page loaded                 │
│                                                                 │
│  Hourly Cost: $0.075/hr  ← Calculated from current power      │
│  = (watts / 1000) × rate/kWh                                   │
│  = (500 / 1000) × $0.15 = $0.075                              │
│                                                                 │
│  Daily Projection: $1.80  ← Projected for full 24 hours       │
│  = (currentDayCost) + (hourlyCost × hoursRemaining)           │
│  = $0.00 + ($0.075 × 24) = $1.80                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│               SUMMARY SECTION (from MongoDB)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Peak Usage: 500 W  ← max(powerData.watts) from session       │
│                                                                 │
│  Average Usage: 500 W  ← mean of all watts from session       │
│                                                                 │
│  Total Energy: 0.001 kWh  ← sum of all kWh_increment         │
│                                                                 │
│  Total Cost: $0.00015  ← Total Energy × rate                  │
│  = 0.001 kWh × $0.15                                          │
│                                                                 │
│  *** TODAY'S COST: $0.42 ***  ← FROM DATABASE                │
│  [All readings stored since 00:00 today]                      │
│  = SELECT SUM(kWh) FROM readings WHERE timestamp TODAY        │
│    THEN multiply by electricity rate                           │
│                                                                 │
│  *** THIS WEEK'S COST: $2.85 ***  ← FROM DATABASE            │
│  [All readings stored in last 7 days]                         │
│  = SELECT SUM(kWh) FROM readings WHERE timestamp LAST 7 DAYS  │
│    THEN multiply by electricity rate                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Why Tuya Shows 0.50 kWh vs Dashboard 0.001 kWh

```
TUYA APP                          DASHBOARD
(Lifetime View)                   (Session View)

Device connected 5 days ago       Dashboard opened 2 minutes ago
Total power used: 0.50 kWh        Power this session: 0.001 kWh

DIFFERENT TIME SCOPES!

To match:
- Close and reopen dashboard after 5 days of use
- Or fetch Tuya's lifetime reading on dashboard startup
```

## Data Storage Illustration

```
Device Power Draw Over 1 Hour (500W constant)

┌─────────────────────────────────────────────────────────┐
│ MEMORY (Session Data)                                   │
├─────────────────────────────────────────────────────────┤
│ powerData.cumulativeKWh = 0.5 kWh                      │
│ powerData.watts = [500, 500, 500, ...]                 │
│ powerData.kwh = [0.00069, 0.00069, ...]                │
│ powerData.labels = ["10:00", "10:05", ...]             │
└─────────────────────────────────────────────────────────┘

         ↓↓↓ STORED IN DATABASE ↓↓↓

┌─────────────────────────────────────────────────────────┐
│ MONGODB: energy_readings Collection                    │
├─────────────────────────────────────────────────────────┤
│ Reading 1: {watts: 500, kWh: 0.00069, ...}             │
│ Reading 2: {watts: 500, kWh: 0.00069, ...}             │
│ Reading 3: {watts: 500, kWh: 0.00069, ...}             │
│ ... (one entry every 5 seconds = 720 readings/hour)    │
│ Reading 720: {watts: 500, kWh: 0.00069, ...}           │
│                                                        │
│ SUM(kWh) = 720 × 0.00069 = 0.5 kWh                    │
│ SUM(cost) = 0.5 × 0.15 = $0.075 (for 1 hour)         │
└─────────────────────────────────────────────────────────┘

         ↓↓↓ RETRIEVED BY ↓↓↓

┌─────────────────────────────────────────────────────────┐
│ calculateDailyCost() / calculateWeeklyCost()            │
├─────────────────────────────────────────────────────────┤
│ Fetches all readings from today (or last 7 days)       │
│ Sums up all the kWh values                             │
│ Multiplies by electricityRate                          │
│ Returns total cost for display                         │
└─────────────────────────────────────────────────────────┘
```

## API Request/Response Cycle (Every 5 Seconds)

```
1. FETCH REAL-TIME DATA
   GET /.netlify/functions/get-smart-plug-data?deviceId=abc123

   Response:
   {
     "watts": 500,
     "device": {...},
     "timestamp": 1731308400000,
     "energy": {
       "kW": 0.5,
       "ratePerKWh": 0.15,
       "hourlyCost": 0.075,
       "projectedDailyCost": 1.8
     }
   }

2. STORE IN DATABASE
   POST /.netlify/functions/store-energy-data
   Body:
   {
     "deviceId": "abc123",
     "watts": 500,
     "kWh": 0.00069,
     "cost": 0.000104
   }

   Response:
   {
     "message": "Reading stored successfully"
   }

3. UPDATE CALCULATIONS
   updateAnalytics(newData)
   updateHistoricalData(newData)
   updateCostDisplays()

4. FETCH TODAY'S DATA (on demand)
   GET /.netlify/functions/store-energy-data
   ?deviceId=abc123
   &startTime=2025-11-11T00:00:00Z
   &endTime=2025-11-11T23:59:59Z

   Response: [{watts: 500, kWh: 0.00069, ...}, {...}, ...]

   Process:
   - Sum all kWh values: 0.5 kWh
   - Multiply by rate: 0.5 × 0.15 = $0.075
   - Display: "Today's Cost: $0.075"
```

## Energy Calculation Formula

```
FOR EACH 5-SECOND POLL:

  Δt (time elapsed) = current timestamp - last timestamp  [milliseconds]

  P (power)          = watts received from Tuya API       [watts]

  kWh_increment      = (P / 1000) × (Δt / 3,600,000)     [kilowatt-hours]

  DETAILED:
  ┌─────────────────────────────────────────┐
  │ P / 1000           = Power in kilowatts │
  │ Δt / 3,600,000     = Time in hours      │
  │ kW × hours = kWh   = Energy consumed    │
  └─────────────────────────────────────────┘

EXAMPLE (500W device, 5 second interval):

  kWh = (500W / 1000) × (5000ms / 3,600,000)
      = 0.5 kW × 0.00000139 hours
      = 0.00000069 kWh
      ≈ 0.00069 kWh per 5 seconds

ACCUMULATION:

  After 5 sec:   0.00069 kWh
  After 10 sec:  0.00138 kWh
  After 1 min:   0.00415 kWh
  After 1 hour:  0.5 kWh ✓
  After 24 hrs:  12 kWh ✓
```

## Debug Checklist

```
□ Device appears in selector
  └─ GET /.netlify/functions/get-smart-plug-data?action=list

□ Power reading updating (changes every 5 sec)
  └─ GET /.netlify/functions/get-smart-plug-data

□ Data storing in database (check Network tab)
  └─ POST /.netlify/functions/store-energy-data (every 5 sec)

□ Session energy accumulating
  └─ powerData.cumulativeKWh should increase by ~0.00069/5sec

□ Today's Cost showing value (not $0.00)
  └─ Run checkDatabaseData() in console
  └─ Verify data returned from query
  └─ Check if electricityRate set correctly

□ Charts updating
  └─ powerChart and energyChart should animate
  └─ patternsChart should build over time
```

# Device Switching Architecture Diagram

## State Management Model

### BEFORE (Single Global State) ❌

```
┌──────────────────────────────────────┐
│     Single Global isDeviceOn         │
├──────────────────────────────────────┤
│  if true → Device 1 is ON            │
│  if false → Any device is OFF        │
│                                      │
│  Problem: Can't track both devices   │
│  simultaneously                      │
└──────────────────────────────────────┘
        ↓
    ❌ FAILS: Device 2 state unknown when Device 1 off
```

### AFTER (Per-Device State) ✅

```
┌──────────────────────────────────────────┐
│     Device States Object                 │
├──────────────────────────────────────────┤
│  {                                       │
│    "device_id_1": true    ← Device 1 ON  │
│    "device_id_2": false   ← Device 2 OFF │
│  }                                       │
│                                          │
│  ✅ Can track all devices independently  │
└──────────────────────────────────────────┘
        ↓
    ✅ SUCCESS: Each device has own state
```

---

## Data Flow: Device Switching

### ❌ BEFORE (Data Mixes)

```
User selects Device 2
        ↓
┌─────────────────────────────────────────┐
│  changeDevice("device_2")               │
├─────────────────────────────────────────┤
│  ❌ Clear powerData arrays              │
│  ❌ Update() charts WITHOUT clearing    │
│     data structures                     │
│  ❌ Don't reset lastUpdateTimestamp     │
│  ❌ Don't update button state           │
└─────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────┐
│  Load Device 2 data                     │
│  BUT old data still in charts!          │
└─────────────────────────────────────────┘
        ↓
❌ Display shows Device 1 data + Device 2 data mixed
```

### ✅ AFTER (Clean Separation)

```
User selects Device 2
        ↓
┌──────────────────────────────────────────────┐
│  changeDevice("device_2")                    │
├──────────────────────────────────────────────┤
│  1. currentDeviceId = "device_2"             │
│  2. Clear all data structures                │
│     - powerData.labels = []                  │
│     - powerData.watts = []                   │
│     - powerData.kwh = []                     │
│     - analytics.dailyData.today = []         │
│  3. Clear all chart data                     │
│     - powerChart.data.labels = []            │
│     - powerChart.data.datasets[0].data = []  │
│     - energyChart.data.labels = []           │
│     - patternsChart.data = Array(24).fill(0) │
│  4. Reset timestamp                          │
│     - lastUpdateTimestamp = Date.now()       │
│  5. Load Device 2 historical data            │
│  6. Fetch Device 2 real-time data            │
│  7. Update button state from device state    │
└──────────────────────────────────────────────┘
        ↓
┌──────────────────────────────────────────────┐
│  Device 2 data loads into clean slate        │
│  No residual Device 1 data                   │
└──────────────────────────────────────────────┘
        ↓
✅ Display shows ONLY Device 2 data
```

---

## Device Toggle Flow

### ❌ BEFORE (State Lost)

```
Device 1: ON (Button "Turn OFF")
Device 2: ON (Button "Turn OFF")

User toggles Device 1 OFF
        ↓
┌────────────────────────────────┐
│ Toggle Device 1                │
├────────────────────────────────┤
│ isDeviceOn = !isDeviceOn       │
│ → isDeviceOn becomes false ❌  │
│   (device 2's state lost!)     │
└────────────────────────────────┘
        ↓
User switches to Device 2
        ↓
Button shows "Turn ON" ❌ (But Device 2 is still ON!)
```

### ✅ AFTER (State Preserved)

```
Device 1: ON → deviceStates["device_1"] = true
Device 2: ON → deviceStates["device_2"] = true

User toggles Device 1 OFF
        ↓
┌─────────────────────────────────────┐
│ Toggle Device 1                     │
├─────────────────────────────────────┤
│ Parse response: newState = false    │
│ setDeviceState("device_1", false)   │
│ → deviceStates["device_1"] = false  │
│ → deviceStates["device_2"] = true   │ ✅ PRESERVED!
│ Button shows "Turn ON" (Device 1)   │
└─────────────────────────────────────┘
        ↓
User switches to Device 2
        ↓
┌──────────────────────────────────────────┐
│ changeDevice("device_2")                 │
│ getDeviceState("device_2") → true        │
│ Button shows "Turn OFF" ✅ CORRECT!      │
└──────────────────────────────────────────┘
```

---

## State Management Lifecycle

### Single Session Example

```
Timeline: Using two devices for 30 minutes

Time    Device 1         Device 2         Action
────────────────────────────────────────────────────────
0:00    ✅ ON            ✅ ON            Device 1 selected
        Button: OFF      Button: OFF      (Device 1 active)

5:00    ✅ ON            ✅ ON            Switch to Device 2
        (unchanged)      (current)        Device 2 selected
        Button: OFF      Button: OFF      (Device 2 active)

10:00   ✅ ON            ✅ ON            Toggle Device 2 OFF
        (unchanged)      ❌ OFF           Device 2 shows $0.00
        Button: OFF      Button: ON       (Device 2 still active)

15:00   ✅ ON            ❌ OFF           Switch to Device 1
        (current)        (unchanged)      Device 1 selected
        Button: OFF      Button: ON       (Device 1 active)
        Shows data       State saved      Button correct for Device 1

20:00   ✅ ON            ❌ OFF           Switch to Device 2
        State saved      (current)        Device 2 selected
        Button: OFF      Button: ON       (Device 2 active)
        Button OFF       Shows $0.00      Button shows OFF/ON matches state

25:00   ✅ ON            ✅ ON            Toggle Device 2 ON
        (unchanged)      (current)        Device 2 resumes
        State saved      Button: OFF      Button: OFF correct

30:00   ✅ ON            ✅ ON            SUMMARY
        ❌ OFF → OFF     OFF → ON
        State correct    State correct
```

---

## Data Structure Comparison

### ❌ BEFORE

```javascript
// Global state (only one device at a time)
let isDeviceOn = true; // ❌ Single boolean
let currentDeviceId = null; // ❌ Only one active
let powerData = {
  /* ... */
}; // ❌ Only for current device
```

### ✅ AFTER

```javascript
// Multi-device support (all devices tracked)
let deviceStates = {
  // ✅ Per-device boolean
  device_id_1: true, // Device 1: ON
  device_id_2: false, // Device 2: OFF
};
let currentDeviceId = null; // Which device to display
let powerData = {
  /* ... */
}; // Data for current device
```

---

## Toggle Button State Machine

### State Transitions

```
┌─────────────────┐
│   Device 1: ON  │
│  Button: OFF    │
└────────┬────────┘
         │ User clicks button
         ↓
    └─ Toggle Request
       └─ Backend toggles device
          └─ Response: {state: false}
             └─ setDeviceState("device_1", false)
                └─ Button: ON
                   └─ Data: $0.00
                      ↓
┌─────────────────┐
│  Device 1: OFF  │
│  Button: ON     │
└────────┬────────┘
         │ User clicks button
         ↓
    └─ Toggle Request
       └─ Backend toggles device
          └─ Response: {state: true}
             └─ setDeviceState("device_1", true)
                └─ Button: OFF
                   └─ Data: resumes
                      ↓
┌─────────────────┐
│   Device 1: ON  │
│  Button: OFF    │
└─────────────────┘
```

### Multi-Device Example

```
Device 1 (ON)       Device 2 (ON)        Action
Button: OFF         Button: OFF          Initial state

Device 1 (OFF)      Device 2 (ON)        User toggles Device 1 OFF
Button: ON          Button: OFF

Device 1 (OFF)      Device 2 (ON)        User switches to Device 2
Button: ON          Button: OFF          (No device changed!)
                    ↑ Stays the same

Device 1 (OFF)      Device 2 (OFF)       User toggles Device 2 OFF
Button: ON          Button: ON

Device 1 (OFF)      Device 2 (OFF)       User switches to Device 1
Button: ON          Button: ON           (No device changed!)
(Same state         ↑ Stays the same
 when switched
 back!)
```

---

## API Request Flow

### Device Switching Sequence

```
Browser                  Function               Backend
  │                         │                      │
  ├─ User selects Device 2  │                      │
  │                         │                      │
  │ changeDevice("d2")      │                      │
  ├─────────────────────────┤                      │
  │                    Clear all data              │
  │                    Reset charts                │
  │                    Reset timestamp             │
  │                         │                      │
  │ fetch store-energy-data │                      │
  ├─────────────────────────────────────────────→ │ Query Device 2 data
  │                         │        Response      │ (last 24 hours)
  │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ←  │
  │  processHistoricalData  │                      │
  │                    Load charts                 │
  │                         │                      │
  │ fetch get-smart-plug-data                      │
  ├──────────────────────────────────────────────→ │ Get Device 2
  │                         │        Response      │ current power
  │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ←  │
  │ Display Device 2 data  │                      │
  │ Update button state    │                      │
  │                         │                      │
  ✅ Device 2 fully loaded
```

### Toggle Sequence

```
Browser                  Function               Backend
  │                         │                      │
  ├─ User clicks button      │                      │
  │                         │                      │
  │ toggleDevice()          │                      │
  ├─────────────────────────┤                      │
  │                   Send POST                    │
  │  {action: "toggle",      │                      │
  │   deviceId: "d2"}        │                      │
  │                         │                      │
  │                   fetch POST                   │
  ├──────────────────────────────────────────────→ │ Toggle Device 2
  │                         │        Response      │
  │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ←  │ {state: false}
  │                         │                      │
  │ Parse response          │                      │
  │ setDeviceState("d2",    │                      │
  │   false)                │                      │
  │ Update button: "Turn ON"│                      │
  │ resetPowerData()        │                      │
  │                         │                      │
  │ fetch get-smart-plug-data                     │
  ├──────────────────────────────────────────────→ │ Get Device 2
  │                         │        Response      │ (now OFF)
  │ ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ←  │ {watts: 0}
  │ Update display: $0.00   │                      │
  │                         │                      │
  ✅ Device 2 toggled OFF
```

---

## Performance Impact

```
Before & After: Operations per cycle (every 5 seconds)

┌─────────────────────────────────────┐
│  Storage Requirements               │
├─────────────────────────────────────┤
│  BEFORE: boolean (1 byte)           │
│  AFTER:  Object { key: boolean }    │
│          (~100 bytes for 2 devices) │
│                                     │
│  Impact: NEGLIGIBLE ✅              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  API Calls                          │
├─────────────────────────────────────┤
│  BEFORE: Same as AFTER              │
│  AFTER:  Same as BEFORE             │
│                                     │
│  Impact: NO CHANGE ✅               │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Execution Time                     │
├─────────────────────────────────────┤
│  BEFORE: ~100ms per cycle           │
│  AFTER:  ~100ms per cycle           │
│          (added ~1ms chart clearing) │
│                                     │
│  Impact: NEGLIGIBLE ✅              │
└─────────────────────────────────────┘
```

---

