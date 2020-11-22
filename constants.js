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
    eventIds: new Set()
  },
  meta: {
    lastUpdated: null,
    tempInCelcius: null,
    successfulPolling: false,
    skippedPolls: 0,
    pollInProgress: false,
    initialLoad: false,
    server: {
      ipAddress: null,
      port: null,
      name: null,
    },
  },
  chemistry: {},
  status: {
    pumps: {}
  },
};
exports.poolSpaInfo = poolSpaInfo;
// I need an object in the global context to keep track of new schedule IDs because... javascript.
// var newScheduleId = null;
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

const pumpsSenderBase = 30;
exports.pumpsSenderBase = pumpsSenderBase;
const schedulesSenderBase = 50;
exports.schedulesSenderBase = schedulesSenderBase;