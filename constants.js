const clientInt = 0;
exports.clientInt = clientInt;

const commonCircuitMap = {
  pool: 505,
  "505": "pool",
  spa: 500,
  "500": "spa",
};
exports.commonCircuitMap = commonCircuitMap;
//quick way to convert body integer to name.
const bodyMap = {
  "0": "pool",
  pool: 0,
  "1": "spa",
  spa: 1,
};
exports.bodyMap = bodyMap;
const poolSpaInfo = {
  schedules: {
    eventIds: [],
    daily: [],
    runOnce: []
  },
  meta: {
    lastUpdated: new Number(),
    tempInCelcius: false,
    successfulPolling: false,
    skippedPolls: 0,
    pollInProgress: false,
    initialLoad: false,
    server: {
      ipAddress: null,
      port: null,
      name: null,
    },
    airTemp: new Number(),
    tempScale: "",
    lightsOn: false
  },
  chemistry: {
    info: "This data only valid if IntelliChem in installed",
    isValid: true,
    error: false,
    calciumLSI: 0,
    cyanuric: 0,
    alkalinity: 0
  },
  status: {
    bodies: [
      {
      name: "pool",
      circuitId: new Number(),
      interfaceId: 0,
      altInterfaceId: 0,
      waterTemp: 0,
      active: false,
      airTemp: 0,
      heater: {
        equipPresent: {
          heater: false,
          solar: false,
          solarisheater: false,
          cooler: false
        },
        modeCode: 0,
        mode: "Off",
        active: false,
        activeCode: 0,
        activeType: "Off",
        setpoint: {
          current: 0,
          min: 0,
          max: 0
        }
      },
      tempScale: ""
    },
      {name: "spa",
      circuitId: 500,
      interfaceId: 1,
      altInterfaceId: 1,
      waterTemp: 0,
      active: false,
      airTemp: 0,
      heater: {
        equipPresent: {
          heater: false,
          solar: false,
          solarisheater: false,
          cooler: false
        },
        modeCode: 0,
        mode: "Off",
        active: false,
        activeCode: 0,
        activeType: "Off",
        setpoint: {
          current: 0,
          min: 0,
          max: 0
        }
      },
      tempScale: ""}
    ],
    pumps: {},
    device: {
      currentStatus: "unknown"
    }
  },
};
exports.poolSpaInfo = poolSpaInfo;

const rawObjects = {
  meta: {
    lastUpdated: null,
  },
};
exports.rawObjects = rawObjects;
const heaterModes = {
  "0": "Off",
  "1": "Solar",
  "2": "Solar Preferred",
  "3": "Heat Pump",
  "4": "Don't Change",
};
exports.heaterModes = heaterModes;
const heaterStatus = {
  "0": "Off",
  "1": "Solar Heater On",
  "2": "Heat Pump On",
};
exports.heaterStatus = heaterStatus;

const scheduleTypeMap = {
  "0": "daily",
  "1": "runOnce",
};
exports.scheduleTypeMap = scheduleTypeMap;

const schedulesSenderBase = 50;
exports.schedulesSenderBase = schedulesSenderBase;

const pumpsSenderBase = 30;
exports.pumpsSenderBase = pumpsSenderBase;
