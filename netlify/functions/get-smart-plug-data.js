const { TuyaContext } = require("@tuya/tuya-connector-nodejs");

// Load environment variables in development
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

// Define available devices
const DEVICES = [
  {
    id: process.env.DEVICE_ID_1,
    name: "Deep Freezer",
    location: "Smart Plug",
    type: "Smart Plug",
  },
  {
    id: process.env.DEVICE_ID_2,
    name: "Computer",
    location: "Smart Plug",
    type: "Smart Plug",
  },
];

exports.handler = async (event, context) => {
  // Initialize Tuya client
  const ACCESS_ID = process.env.TUYA_ACCESS_ID;
  const ACCESS_SECRET = process.env.TUYA_ACCESS_SECRET;

  if (!ACCESS_ID || !ACCESS_SECRET) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing Tuya API credentials" }),
    };
  }

  const tuya = new TuyaContext({
    baseUrl: "https://openapi.tuyaeu.com",
    accessKey: ACCESS_ID,
    secretKey: ACCESS_SECRET,
    timeout: 10000,
  });

  // Handle device control (POST)
  if (event.httpMethod === "POST") {
    try {
      const command = JSON.parse(event.body);
      console.log("Toggle command received:", command);

      const deviceId =
        command.deviceId ||
        event.queryStringParameters?.deviceId ||
        DEVICES[0].id;
      console.log("Using deviceId:", deviceId);

      if (command.action !== "toggle") {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid action" }),
        };
      }

      const apiEndpoints = [
        // Method 1: Shadow properties (v2.0)
        {
          name: "Shadow Properties",
          endpoint: `/v2.0/cloud/thing/${deviceId}/shadow/properties`,
          method: "GET",
        },
        // Method 2: Device status (traditional v1.0 but might still work)
        {
          name: "Device Status (v1.0)",
          endpoint: `/v1.0/devices/${deviceId}/status`,
          method: "GET",
        },
        // Method 3: Device info
        {
          name: "Device Info",
          endpoint: `/v1.0/devices/${deviceId}`,
          method: "GET",
        },
        // Method 4: Thing model (for property codes)
        {
          name: "Thing Model",
          endpoint: `/v2.0/cloud/thing/${deviceId}/model`,
          method: "GET",
        },
      ];

      let allResponses = {};

      for (const api of apiEndpoints) {
        try {
          console.log(`Trying ${api.name}...`);
          const response = await Promise.race([
            tuya.request({
              method: api.method,
              path: api.endpoint,
            }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`${api.name} timeout`)), 5000)
            ),
          ]);

          console.log(
            `${api.name} Response:`,
            JSON.stringify(response, null, 2)
          );
          allResponses[api.name] = response;

          if (response.success) {
            console.log(`${api.name} SUCCESS!`);
          } else {
            console.log(`${api.name} FAILED:`, response.msg || "Unknown error");
          }
        } catch (error) {
          console.log(`${api.name} ERROR:`, error.message);
          allResponses[api.name] = { error: error.message };
        }
      }

      let toggleProperty = null;
      let currentState = null;

      // Check shadow properties for switch state
      const shadowResponse = allResponses["Shadow Properties"];
      if (shadowResponse && shadowResponse.success && shadowResponse.result) {
        const state = shadowResponse.result.state || {};
        const desired = shadowResponse.result.desired || {};
        const reported = shadowResponse.result.reported || {};

        console.log("Shadow State:", state);
        console.log("Desired State:", desired);
        console.log("Reported State:", reported);

        // Look for switch properties
        const switchCandidates = [
          "switch",
          "switch_1",
          "switch_led",
          "switch_1_1",
        ];

        for (const switchCode of switchCandidates) {
          const value =
            state[switchCode]?.value ||
            state[switchCode] ||
            desired[switchCode]?.value ||
            desired[switchCode] ||
            reported[switchCode]?.value ||
            reported[switchCode];

          if (value !== undefined) {
            console.log(`Found switch property '${switchCode}':`, value);
            toggleProperty = switchCode;
            currentState = value;
            break;
          }
        }
      }

      // If not found in shadow, try traditional status
      if (!toggleProperty) {
        const statusResponse = allResponses["Device Status (v1.0)"];
        if (statusResponse && statusResponse.success && statusResponse.result) {
          console.log("Traditional Status Response:", statusResponse.result);

          const switchCandidates = [
            "switch",
            "switch_1",
            "switch_led",
            "switch_1_1",
          ];

          for (const switchCode of switchCandidates) {
            const status = statusResponse.result.find(
              (x) => x.code === switchCode
            );
            if (status) {
              console.log(
                `Found switch property '${switchCode}' in status:`,
                status.value
              );
              toggleProperty = switchCode;
              currentState = status.value;
              break;
            }
          }
        }
      }

      // If still no switch found, try common ones
      if (!toggleProperty) {
        console.log(
          "No standard switch found, trying common property codes..."
        );
        const commonSwitches = [
          "switch_1",
          "switch",
          "switch_led",
          "power_switch",
        ];

        for (const switchCode of commonSwitches) {
          console.log(`Trying common switch code: ${switchCode}`);
          try {
            const response = await tuya.request({
              method: "POST",
              path: `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`,
              body: {
                properties: [
                  {
                    code: switchCode,
                    value: true, // Try to turn it ON
                  },
                ],
              },
            });

            if (response.success) {
              console.log(
                `SUCCESS with switch code '${switchCode}'! Device turned ON`
              );
              toggleProperty = switchCode;
              currentState = true;

              // Send success response
              return {
                statusCode: 200,
                headers: {
                  "Access-Control-Allow-Origin": "*",
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  success: true,
                  state: true,
                  deviceId: deviceId,
                  switchProperty: switchProperty,
                  message: `Device toggled via v2.0 API using switch '${switchCode}'`,
                  debug: allResponses,
                }),
              };
            }
          } catch (error) {
            console.log(`Switch code '${switchCode}' failed:`, error.message);
          }
        }
      }

      // If we found a switch property, toggle it
      if (toggleProperty) {
        const newState = !currentState;
        console.log(
          `Toggling ${toggleProperty} from ${currentState} to ${newState}`
        );

        try {
          await Promise.race([
            tuya.request({
              method: "POST",
              path: `/v2.0/cloud/thing/${deviceId}/shadow/properties/issue`,
              body: {
                properties: [
                  {
                    code: toggleProperty,
                    value: newState,
                  },
                ],
              },
            }),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Toggle command timeout")),
                8000
              )
            ),
          ]);

          console.log("Toggle command sent successfully");

          return {
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              success: true,
              state: newState,
              deviceId: deviceId,
              switchProperty: toggleProperty,
              previousState: currentState,
              message: "Device toggled successfully",
              debug: allResponses,
            }),
          };
        } catch (error) {
          throw new Error(`Failed to toggle device: ${error.message}`);
        }
      } else {
        // No toggleable property found
        return {
          statusCode: 404,
          body: JSON.stringify({
            error: "No toggleable switch property found on this device",
            foundSwitchProperty: null,
            availableResponses: Object.keys(allResponses),
            debug: allResponses,
          }),
        };
      }
    } catch (error) {
      console.error("Toggle error:", error);
      return {
        statusCode: 503,
        body: JSON.stringify({
          error: "Failed to toggle device",
          details: error.message,
          apiVersion: "v2.0",
        }),
      };
    }
  }

  try {
    // Handle list devices request
    if (
      event.httpMethod === "GET" &&
      event.queryStringParameters?.action === "list"
    ) {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          DEVICES.map((d) => ({
            id: d.id,
            name: d.name,
            location: d.location,
            type: d.type,
          }))
        ),
      };
    }

    // Get device ID from query parameters or use default
    const deviceId = event.queryStringParameters?.deviceId || DEVICES[0].id;
    const device = DEVICES.find((d) => d.id === deviceId) || DEVICES[0];

    console.log("=== COMPREHENSIVE POWER DATA ANALYSIS ===");
    console.log("Device ID:", deviceId);
    console.log("Device info:", device);

    // Try multiple methods to get power data
    const powerDataMethods = [
      {
        name: "Shadow Properties (v2.0)",
        method: "GET",
        path: `/v2.0/cloud/thing/${deviceId}/shadow/properties`,
      },
      {
        name: "Traditional Status (v1.0)",
        method: "GET",
        path: `/v1.0/devices/${deviceId}/status`,
      },
      {
        name: "Device Properties",
        method: "GET",
        path: `/v1.0/devices/${deviceId}/functions`,
      },
    ];

    let allPowerData = {};
    let bestPowerData = null;

    for (const method of powerDataMethods) {
      try {
        console.log(`Trying ${method.name}...`);
        const response = await Promise.race([
          tuya.request({
            method: method.method,
            path: method.path,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${method.name} timeout`)), 8000)
          ),
        ]);

        console.log(
          `${method.name} Response:`,
          JSON.stringify(response, null, 2)
        );
        allPowerData[method.name] = response;

        if (response.success) {
          // Extract power data from this method
          let extractedPowerData = extractPowerData(method.name, response);
          if (extractedPowerData) {
            console.log(
              `Power data extracted from ${method.name}:`,
              extractedPowerData
            );

            // Prefer this method if it has power data and the previous best doesn't
            if (!bestPowerData || extractedPowerData.watts > 0) {
              bestPowerData = {
                method: method.name,
                data: extractedPowerData,
                rawResponse: response,
              };
            }
          }
        }
      } catch (error) {
        console.log(`${method.name} failed:`, error.message);
        allPowerData[method.name] = { error: error.message };
      }
    }

    // If we have power data, use it; otherwise use best available
    let finalPowerData = bestPowerData?.data || {
      watts: 0,
      isDeviceOn: false,
      rawPowerValue: null,
      powerPropertyCode: null,
      switchState: null,
    };

    console.log("=== FINAL POWER ANALYSIS ===");
    console.log("Selected method:", bestPowerData?.method || "None");
    console.log("Final power data:", finalPowerData);

    // Calculate costs
    const RATE_PER_KWH = process.env.ELECTRICITY_RATE || 9.5;
    const kW = finalPowerData.watts / 1000;
    const hourlyRate = kW * RATE_PER_KWH;
    const dailyCost = hourlyRate * 24;

    // Prepare response
    const responseData = {
      watts: finalPowerData.watts,
      device: {
        id: device.id,
        name: device.name,
        location: device.location,
        type: device.type,
        online: true,
        isOn: finalPowerData.isDeviceOn,
        rawPowerValue: finalPowerData.rawPowerValue,
        powerPropertyCode: finalPowerData.powerPropertyCode,
        switchState: finalPowerData.switchState,
        v2APIUsed: true,
      },
      timestamp: Date.now(),
      energy: {
        kW: Math.round(kW * 1000) / 1000,
        ratePerKWh: RATE_PER_KWH,
        hourlyCost: Math.round(hourlyRate * 1000) / 1000,
        projectedDailyCost: Math.round(dailyCost * 100) / 100,
      },
      debug: {
        v2API: true,
        bestMethod: bestPowerData?.method || "None",
        allMethods: Object.keys(allPowerData),
        allResponses: allPowerData,
        selectedData: finalPowerData,
      },
    };

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(responseData),
    };
  } catch (error) {
    console.error("=== COMPREHENSIVE API ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    return {
      statusCode: 502,
      body: JSON.stringify({
        error: error.message,
        apiVersion: "v2.0",
        suggestion: "Check device ID and API credentials",
      }),
    };
  }
};

// Helper function to extract power data from different API responses
function extractPowerData(methodName, response) {
  let watts = 0;
  let isDeviceOn = false;
  let rawPowerValue = null;
  let powerPropertyCode = null;
  let switchState = null;

  try {
    if (methodName === "Shadow Properties (v2.0)") {
      const deviceState = response.result?.state || {};
      const reportedState = response.result?.reported || {};
      const desiredState = response.result?.desired || {};

      console.log("Analyzing v2.0 shadow properties...");

      // Look for switch state
      const switchCandidates = [
        "switch_1",
        "switch",
        "switch_led",
        "power_switch",
      ];
      for (const code of switchCandidates) {
        const switchValue =
          deviceState[code]?.value ||
          deviceState[code] ||
          reportedState[code]?.value ||
          reportedState[code] ||
          desiredState[code]?.value ||
          desiredState[code];

        if (switchValue !== undefined) {
          switchState = switchValue;
          isDeviceOn = Boolean(switchValue);
          break;
        }
      }

      // Look for power data
      const powerCandidates = [
        "cur_power",
        "power",
        "pwr",
        "electric_power",
        "active_power",
        "power_consumption",
      ];
      for (const code of powerCandidates) {
        const powerValue =
          deviceState[code]?.value ||
          deviceState[code] ||
          reportedState[code]?.value ||
          reportedState[code] ||
          desiredState[code]?.value ||
          desiredState[code];

        if (powerValue !== undefined && powerValue > 0) {
          console.log(`Found power data with code '${code}':`, powerValue);
          rawPowerValue = powerValue;
          powerPropertyCode = code;

          // Process power value
          if (powerValue > 10000) {
            watts = powerValue / 1000; // mW to W
          } else if (powerValue > 1000) {
            watts = powerValue / 10; // cW to W
          } else {
            watts = powerValue; // Already in W
          }

          console.log(`Processed power: ${powerValue} -> ${watts}W`);
          break;
        }
      }
    } else if (methodName === "Traditional Status (v1.0)") {
      console.log("Analyzing v1.0 status response...");

      if (Array.isArray(response.result)) {
        // Look for switch and power properties
        for (const item of response.result) {
          const code = item.code;
          const value = item.value;

          // Check for switch
          if (
            ["switch_1", "switch", "switch_led", "power_switch"].includes(code)
          ) {
            switchState = value;
            isDeviceOn = Boolean(value);
          }

          // Check for power
          if (
            [
              "cur_power",
              "power",
              "pwr",
              "electric_power",
              "active_power",
              "power_consumption",
            ].includes(code)
          ) {
            rawPowerValue = value;
            powerPropertyCode = code;

            // Process power value
            if (value > 10000) {
              watts = value / 1000; // mW to W
            } else if (value > 1000) {
              watts = value / 10; // cW to W
            } else {
              watts = value; // Already in W
            }
          }
        }
      }
    } else if (methodName === "Device Properties") {
      console.log("Analyzing device properties/functions...");
      // This might give us the available property codes
      if (response.result && Array.isArray(response.result)) {
        console.log("Available property codes:", response.result);
      }
    }
  } catch (error) {
    console.error(`Error extracting power data from ${methodName}:`, error);
  }

  return {
    watts: Math.round(watts * 10) / 10,
    isDeviceOn,
    rawPowerValue,
    powerPropertyCode,
    switchState,
  };
}
