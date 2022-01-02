#!/usr/bin/env node
"use strict";

const { equipFlagsMeanings } = require("./equipFlagsMeanings");
const { poolSpaInfo, bodyMap, heaterModes, clientInt, commonCircuitMap, heaterStatus, rawObjects, scheduleTypeMap, pumpsSenderBase, schedulesSenderBase } = require("./constants");
const express = require("express");
const app = express();
// const bodyParser = require('body-parser');
const expressPort = process.env.PORT || 3000;
const ScreenLogic = require("node-screenlogic");
const cors = require("cors");



app.use(cors());
// app.use(express.json());
// defaulting to 5 second poll intervals.
// Override with POLL_INTERVAL environment variable.

// This is now deprecated as I am using the addClient API.
// const pollInterval = process.env.POLL_INTERVAL || 5000; //5000 = 5 sec

// New poll skipping mechanism is in place, but we want to only allow a max number to be skipped...
// Override with MAX_POLL_SKIP environment variable.
const baseApiPath = process.env.BASE_PATH || "/api";
// Read other Configs from the Environment
let slIpAddress = process.env.SL_IP_ADDRESS || null;
let slPort = process.env.SL_PORT || 80;
let slName = process.env.SL_NAME || null;
const featuresInterface = process.env.FEATURES_LOCATION || "features";

function findScreenLogic() {
  if (slIpAddress && slPort) {
    // console.log(server)
    // console.log(connection);
    console.log("Got Screenlogic IP address and Port from the Environment.");
    poolSpaInfo.meta.server = {
      ipAddress: slIpAddress,
      port: slPort,
      name: slName,
    };
    if (slName) {
      poolSpaInfo.meta.server.name = slName;
    }
  } else {
    const finder = new ScreenLogic.FindUnits();
    finder.search();
    finder.on("serverFound", function (server) {
      console.log(
        "Found ScreenLogic unit at: " + server.address + ":" + server.port
      );
      slIpAddress = server.address;
      slPort = server.port;
      slName = server.gatewayName;
      poolSpaInfo.meta.server = {
        ipAddress: server.address,
        port: server.port,
        name: server.gatewayName,
      };
      finder.close();
    });
  }
}

function getSlClient(port = slPort, ipAddress = slIpAddress) {
  return new ScreenLogic.UnitConnection(port, ipAddress);
}

function setHeatMode(body, heatMode) {
  // Body: pool = 0; spa = 1
  // heatMode: 0: "Off", 1: "Solar", 2 : "Solar Preferred", 3 : "Heat Pump", 4: "Don't Change"
  const client = getSlClient();
  const heatBody = bodyMap[body];
  client
    .on("loggedIn", function () {
      console.log(
        "Logged in, setting heater state for " +
          heatBody +
          " to " +
          heaterModes[heatMode]
      );
      this.setHeatMode(clientInt, body, heatMode);
    })
    .on("heatModeChanged", function () {
      console.log(
        "Changed " + heatBody + " heater state to " + heaterModes[heatMode]
      );
      client.close();
    })
    .on("loginFailed", function () {
      console.log("Unable to login... refreshing client.");
      client.close();
    });
  client.connect();
}

function setHeatSetPoint(body, temp) {
  const client = getSlClient();
  const heatBody = bodyMap[body];
  console.log(
    "Setting heater setpoint for " + heatBody + " to " + temp + " degrees."
  );
  client
    .on("loggedIn", function () {
      console.log("Logged in...");
      this.setSetPoint(clientInt, body, temp);
    })
    .on("setPointChanged", function () {
      console.log(heatBody + " setpoint Successfully changed to " + temp);
      client.close();
    })
    .on("loginFailed", function () {
      console.log("Unable to login...");
      client.close();
    });
  client.connect();
}

function setNewCircuitState(circuitId, state) {
  const client = getSlClient();
  console.log(
    "Invoking change state with state = " +
      state +
      " and circuit ID = " +
      circuitId
  );
  client
    .on("loggedIn", function () {
      console.log(
        "Logged in, sending state " + state + " to circuit ID " + circuitId
      );
      this.setCircuitState(clientInt, circuitId, state);
    })
    .on("circuitStateChanged", function () {
      const newState = state === 0 ? "off" : "on";
      console.log(`Circuit ${circuitId} set to ${newState}.`);
      client.close();
      // getAllpoolSpaInfo();
    })
    .on("loginFailed", function () {
      console.log("Unable to login...refreshing client.");
      client.close();
      findScreenLogic();
    });
  client.connect();
}

function getAllpoolSpaInfo() {
  poolSpaInfo.meta.pollInProgress = true;
  const client = getSlClient();
  const pollTime = Date.now();
  client
    .on("loggedIn", function () {
      console.log('Logged In...')
      if (!poolSpaInfo.meta.server.name) {
        poolSpaInfo.meta.server.name =
          "Pentair: " + client.challengeString.substr(9);
      };
      this.getVersion();
      this.getPoolStatus();
      this.getSaltCellConfig();
      this.getControllerConfig();
      this.getChemicalData();
      var i;
      for (i = 0; i < 8; i++) {
        console.log('Pump ID: ' + i);
        var pumpSid = pumpsSenderBase + i;
        console.log("Pump SenderID: " + pumpSid);
        this.getPumpStatus(i, pumpSid);
      };
      for (i = 0; i < 2; i++) {
        var scheduleSid = schedulesSenderBase + i;
        console.log('Requesting Schedule Type: ' + scheduleTypeMap[i])
        console.log('Schedule SenderID: ' + scheduleSid);
        this.getScheduleData(i, scheduleSid);
      };

    })
    .on("version", function (version) {
      console.log("Got Version " + version);
      poolSpaInfo.firmware = {
        version: version.version,
      };
      // console.log(' version=' + version.version);
    })
    .on("poolStatus", function (status) {
      poolSpaInfo.meta.airTemp = status.airTemp || poolSpaInfo.meta.airTemp;
      poolSpaInfo.meta.activeAlarms = status.alarms || poolSpaInfo.meta.activeAlarms;
      poolSpaInfo.meta.serviceMode = status.isDeviceServiceMode() || poolSpaInfo.meta.serviceMode;
      poolSpaInfo.meta.freezeMode = status.freezeMode || poolSpaInfo.meta.freezeMode; 
      poolSpaInfo.meta.cleanerDelay = status.cleanerDelay || poolSpaInfo.meta.cleanerDelay;
      let spaActive = false;
      try {
        spaActive = status.isSpaActive();
      } catch (e) {
        // ignore
      }
      poolSpaInfo.status = {
        bodies: [
          {
            name: "pool",
            circuitId: commonCircuitMap.pool,
            interfaceId: 0,
            altInterfaceId: featuresInterface.toLowerCase() === "pool" ? 2 : 0,
            waterTemp: status.currentTemp[0],
            active: status.isPoolActive(),
            airTemp: status.airTemp,
            heater: {
              equipPresent: {},
              modeCode: status.heatMode[0],
              mode: heaterModes[status.heatMode[0]],
              active: status.heatStatus[0] > 0,
              activeCode: status.heatStatus[0],
              activeType: heaterStatus[status.heatStatus[0]],
              setpoint: {
                current: status.setPoint[0],
              },
            },
          },
          {
            name: "spa",
            circuitId: commonCircuitMap.spa,
            interfaceId: 1,
            altInterfaceId: featuresInterface.toLowerCase() === "spa" ? 2 : 1,
            waterTemp: status.currentTemp[1],
            active: spaActive,
            airTemp: status.airTemp,
            heater: {
              equipPresent: {},
              modeCode: status.heatMode[1],
              mode: heaterModes[status.heatMode[1]],
              active: status.heatStatus[1] > 0,
              activeCode: status.heatStatus[1],
              activeType: heaterStatus[status.heatStatus[1]],
              setpoint: {
                current: status.setPoint[1],
              },
            },
          },
        ],
        device: {
          currentStatus: status.ok,
          ready: status.isDeviceReady(),
          sync: status.isDeviceSync(),
          activeAlarms: status.alarms,
          serviceMode: status.isDeviceServiceMode(),
          freezeMode: status.freezeMode,
        },
        chemistry: {
          saltPPM: status.saltPPM,
          ph: status.pH,
          calciumSaturation: status.saturation,
        },
        circuits: status.circuitArray,
      };
      rawObjects.status = status;
    })
    .on("saltCellConfig", function (saltCellConfig) {
      poolSpaInfo.saltCell = {
        installed: saltCellConfig.installed,
        status: saltCellConfig.status,
        saltLevel: saltCellConfig.salt,
      };
      rawObjects.saltCellConfig = saltCellConfig;
    })
    .on("controllerConfig", function (config) {
      poolSpaInfo.meta.tempInCelcius = config.degC;
      poolSpaInfo.controllerConfig = {
        tempInCelcius: config.degC,
        tempScale: config.degC ? "C" : "F",
        pumps: config.pumpCircArray,
        bodyArray: config.bodyArray,
        controllerId: config.controllerId,
        poolMinSetPoint: config.minSetPoint[0],
        poolMaxSetPoint: config.maxSetPoint[0],
        spaMinSetPoint: config.minSetPoint[1],
        spaMaxSetPoint: config.maxSetPoint[1],
        interfaceTabFlags: config.interfaceTabFlags,
        equipFlags: config.equipFlags,
        equipPresent: equipFlagsMeanings[config.equipFlags],
      };
      poolSpaInfo.chemistry.intellichemInstalled = config.hasIntellichem();
      poolSpaInfo.status.bodies.forEach(function (v, i) {
        v.heater.equipPresent.heater =
          poolSpaInfo.controllerConfig.equipPresent.heater;
        v.heater.equipPresent.solar =
          poolSpaInfo.controllerConfig.equipPresent.solar;
        v.heater.equipPresent.solarisheater =
          poolSpaInfo.controllerConfig.equipPresent.solarisheater;
        v.heater.equipPresent.cooler =
          poolSpaInfo.controllerConfig.equipPresent.cooler;
        v.tempScale = config.degC ? "C" : "F";
        v.heater.setpoint.min = config.minSetPoint[i];
        v.heater.setpoint.max = config.maxSetPoint[i];
      });
      poolSpaInfo.meta.tempScale = config.degC ? "C" : "F";
      rawObjects.config = config;
      poolSpaInfo.controllerConfig.bodyArray.forEach((c) => {
        poolSpaInfo.status.circuits.forEach((z) => {
          if (c.circuitId === z.id) {
            // console.log(c.circuitId)
            c.state = z.state;
            c.delay = z.delay;
            if (z.state === 0) {
              c.active = false;
            } else if (z.state === 1) {
              c.active = true;
            }
          }
         });
        if (c.name === "Lights") {
          // console.log(c.name)
          // console.log(Object.keys(c))
          poolSpaInfo.meta.lightsOn = c.active;
        }
      });
    })
    .on('getPumpStatus', function(pumpData){
      var pumpId = pumpData.senderId - pumpsSenderBase;
      console.log('Got Pump Status for senderID ' + pumpData.senderId)
      var pumpTypeName = "Unknown Pump Type";
      if(pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVF){
        pumpTypeName = "IntelliFlo VF"
      } else if (pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVS){
        pumpTypeName = "IntelliFlo VFS"
      } else if (pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVSF){
        pumpTypeName = "IntelliFlo VS"
      };
      console.log(pumpTypeName);
      rawObjects.pumps = {
        [pumpId] : pumpData
      };
      var pumpApiData = {
          pumpSetting : pumpData.pumpSetting,
          pumpType: pumpData.pumpType,
          isRunning: pumpData.isRunning,
          pumpTypeName: pumpTypeName,
          pumpWatts: pumpData.pumpWatts,
          pumpRPMs: pumpData.pumpRPMs,
          pumpGPMs: pumpData.pumpGPMS,
          pumpUnknown1: pumpData.pumpUnknown1,
          pumpUnknown2: pumpData.pumpUnknown2
      }
      poolSpaInfo.status.pumps = {
        [pumpId.toString()] : pumpApiData
      };
    })
    .on("getScheduleData", function (schedules) {
      console.log("Schedule return SenderID: " + schedules.senderId);
      var scheduleType = schedulesSenderBase - schedules.senderId;
      var scheduleTypeName = scheduleTypeMap[scheduleType];

      poolSpaInfo.schedules[scheduleTypeName] = schedules.events;
      aggregateScheduleIds();
    })
    .on("chemicalData", function (chemData) {
      poolSpaInfo.chemistry = {
        info: "This data only valid if IntelliChem in installed",
        isValid: chemData.isValid,
        error: chemData.error,
        calciumLSI: chemData.calcium,
        cyanuric: chemData.cyanuricAcid,
        alkalinity: chemData.alkalinity,
      };
      rawObjects.chemData = chemData;
      poolSpaInfo.meta.lastUpdated = pollTime;
      rawObjects.meta.lastUpdated = pollTime;
      //connection cleanup
      if (!poolSpaInfo.meta.successfulPolling) {
        console.log("Initial State Data loaded from ScreenLogic.");
        // console.log('\n')
        // console.log(poolSpaInfo)
        // console.log('\n')
      }
      poolSpaInfo.meta.successfulPolling = true;
      // console.log('Info Refreshed')
      client.close();
      poolSpaInfo.meta.pollInProgress = false;
    })
    .on("loginFailed", function () {
      //Handle login failure
      console.log("Unable to login...refreshing client.");
      client.close();
      findScreenLogic();
    });
  client.connect();
  // getAllSchedules(client);
}
// exports.poolSpaInfo = poolSpaInfo;

function poolSpaChangeListner() {
  const client = getSlClient();
  client
    .on("loggedIn", function () {
      console.log('Listner logged In...')
      //set up listners...
      this.addClient(1234);
      this.getPoolStatus();
      this.getSaltCellConfig();
      this.getControllerConfig();
      this.getChemicalData();
      var i;
      //get all pump data
      for (i = 0; i < 8; i++) {
        console.log('Pump ID: ' + i);
        var pumpSid = pumpsSenderBase + i;
        console.log("Pump SenderID: " + pumpSid);
        this.getPumpStatus(i, pumpSid);
      };
      //get schedule data
      for (i = 0; i < 2; i++) {
        var scheduleSid = schedulesSenderBase + i;
        console.log('Requesting Schedule Type: ' + scheduleTypeMap[i])
        console.log('Schedule SenderID: ' + scheduleSid);
        this.getScheduleData(i, scheduleSid);
      };

    })
    .on("poolStatus", function (status) {
      poolSpaInfo.meta.airTemp = status.airTemp || poolSpaInfo.meta.airTemp;
      poolSpaInfo.meta.activeAlarms = status.alarms || poolSpaInfo.meta.activeAlarms;
      poolSpaInfo.meta.serviceMode = status.isDeviceServiceMode() || poolSpaInfo.meta.serviceMode;
      poolSpaInfo.meta.freezeMode = status.freezeMode || poolSpaInfo.meta.freezeMode; 
      poolSpaInfo.meta.cleanerDelay = status.cleanerDelay || poolSpaInfo.meta.cleanerDelay;
      let spaActive = false;
      try {
        spaActive = status.isSpaActive();
      } catch (e) {
        // ignore
      }
      // update pool info...
      poolSpaInfo.status.bodies[0].waterTemp = status.currentTemp[0] ||  poolSpaInfo.status.bodies[0].waterTemp;
      poolSpaInfo.status.bodies[0].active = status.isPoolActive() || poolSpaInfo.status.bodies[0].active;
      poolSpaInfo.status.bodies[0].airTemp = status.airTemp || poolSpaInfo.status.bodies[0].airTemp;

      poolSpaInfo.status.bodies[0].heater.modeCode = status.heatMode[0] || poolSpaInfo.status.bodies[0].heater.modeCode;
      poolSpaInfo.status.bodies[0].heater.mode = heaterModes[status.heatMode[0]] || poolSpaInfo.status.bodies[0].heater.mode;
      poolSpaInfo.status.bodies[0].heater.active = status.heatStatus[0] > 0 || poolSpaInfo.status.bodies[0].heater.active;
      poolSpaInfo.status.bodies[0].heater.activeCode = status.heatStatus[0] || poolSpaInfo.status.bodies[0].heater.activeCode;
      poolSpaInfo.status.bodies[0].heater.activeType = heaterStatus[status.heatStatus[0]] || poolSpaInfo.status.bodies[0].heater.activeType;
      poolSpaInfo.status.bodies[0].heater.setpoint.current = status.setPoint[0] || poolSpaInfo.status.bodies[0].heater.setpoint.current;

      // update spa info
      poolSpaInfo.status.bodies[1].waterTemp = status.currentTemp[1] ||  poolSpaInfo.status.bodies[1].waterTemp;
      poolSpaInfo.status.bodies[1].active = spaActive || poolSpaInfo.status.bodies[1].active;
      poolSpaInfo.status.bodies[1].airTemp = status.airTemp || poolSpaInfo.status.bodies[1].airTemp;

      poolSpaInfo.status.bodies[1].heater.modeCode = status.heatMode[1] || poolSpaInfo.status.bodies[1].heater.modeCode;
      poolSpaInfo.status.bodies[1].heater.mode = heaterModes[status.heatMode[1]] || poolSpaInfo.status.bodies[1].heater.mode;
      poolSpaInfo.status.bodies[1].heater.active = status.heatStatus[1] > 0 || poolSpaInfo.status.bodies[1].heater.active;
      poolSpaInfo.status.bodies[1].heater.activeCode = status.heatStatus[1] || poolSpaInfo.status.bodies[1].heater.activeCode;
      poolSpaInfo.status.bodies[1].heater.activeType = heaterStatus[status.heatStatus[1]] || poolSpaInfo.status.bodies[1].heater.activeType;
      poolSpaInfo.status.bodies[1].heater.setpoint.current = status.setPoint[1] || poolSpaInfo.status.bodies[1].heater.setpoint.current;
      //update device status
      poolSpaInfo.status.device.currentStatus = status.ok || poolSpaInfo.status.device.currentStatus;
      poolSpaInfo.status.device.ready = status.isDeviceReady() || poolSpaInfo.status.device.ready;
      poolSpaInfo.status.device.sync = status.isDeviceSync() || poolSpaInfo.status.device.sync;
      poolSpaInfo.status.device.activeAlarms = status.alarms || poolSpaInfo.status.device.activeAlarms;
      poolSpaInfo.status.device.serviceMode = status.isDeviceServiceMode() || poolSpaInfo.status.device.serviceMode;
      poolSpaInfo.status.device.freezeMode = status.freezeMode || poolSpaInfo.status.device.freezeMode;
      // update chemistry
      poolSpaInfo.status.chemistry.saltPPM = status.saltPPM || poolSpaInfo.status.chemistry.saltPPM;
      poolSpaInfo.status.chemistry.ph = status.pH || poolSpaInfo.status.chemistry.ph;
      poolSpaInfo.status.chemistry.calciumSaturation = status.saturation || poolSpaInfo.status.chemistry.calciumSaturation;
    })
    .on("saltCellConfig", function (saltCellConfig) {
      poolSpaInfo.saltCell.status = saltCellConfig.status || poolSpaInfo.saltCell.status;
      poolSpaInfo.saltCell.saltLevel = saltCellConfig.salt || poolSpaInfo.saltCell.saltLevel;
    })
    .on("controllerConfig", function (config) {
      poolSpaInfo.controllerConfig.bodyArray.forEach((c) => {
        poolSpaInfo.status.circuits.forEach((z) => {
          if (c.circuitId === z.id) {
            // console.log(c.circuitId)
            c.state = z.state;
            c.delay = z.delay;
            if (z.state === 0) {
              c.active = false;
            } else if (z.state === 1) {
              c.active = true;
            }
          }
         });
        if (c.name === "Lights") {
          // console.log(c.name)
          // console.log(Object.keys(c))
          poolSpaInfo.meta.lightsOn = c.active;
        }
      });
    })
    .on('getPumpStatus', function(pumpData){
      var pumpId = pumpData.senderId - pumpsSenderBase;
      var pumpIdString = pumpId.toString();
      console.log('Got Pump Status update for senderID ' + pumpData.senderId)
      var pumpTypeName = "Unknown Pump Type";
      if(pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVF){
        pumpTypeName = "IntelliFlo VF"
      } else if (pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVS){
        pumpTypeName = "IntelliFlo VFS"
      } else if (pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVSF){
        pumpTypeName = "IntelliFlo VS"
      };
      console.log(pumpTypeName);
      poolSpaInfo.status.pumps[pumpIdString].pumpSetting = pumpData.pumpSetting || poolSpaInfo.status.pumps[pumpIdString].pumpSetting;
      poolSpaInfo.status.pumps[pumpIdString].pumpType = pumpData.pumpType || poolSpaInfo.status.pumps[pumpIdString].pumpType;
      poolSpaInfo.status.pumps[pumpIdString].isRunning = pumpData.isRunning || poolSpaInfo.status.pumps[pumpIdString].isRunning;
      poolSpaInfo.status.pumps[pumpIdString].pumpTypeName = pumpTypeName || poolSpaInfo.status.pumps[pumpIdString].pumpTypeName;
      poolSpaInfo.status.pumps[pumpIdString].pumpWatts = pumpData.pumpWatts || poolSpaInfo.status.pumps[pumpIdString].pumpWatts;
      poolSpaInfo.status.pumps[pumpIdString].pumpRPMs = pumpData.pumpRPMs || poolSpaInfo.status.pumps[pumpIdString].pumpRPMs;
      poolSpaInfo.status.pumps[pumpIdString].pumpGPMs = pumpData.pumpGPMS || poolSpaInfo.status.pumps[pumpIdString].pumpGPMs;
      poolSpaInfo.status.pumps[pumpIdString].pumpUnknown1 = pumpData.pumpUnknown1 || poolSpaInfo.status.pumps[pumpIdString].pumpUnknown1;
      poolSpaInfo.status.pumps[pumpIdString].pumpUnknown2 = pumpData.pumpUnknown2 || poolSpaInfo.status.pumps[pumpIdString].pumpUnknown2;
    })
    .on("getScheduleData", function (schedules) {
      // This one may require more work...
      console.log("Schedule return SenderID: " + schedules.senderId);
      var scheduleType = schedulesSenderBase - schedules.senderId;
      var scheduleTypeName = scheduleTypeMap[scheduleType];
      poolSpaInfo.schedules[scheduleTypeName] = schedules.events;
      aggregateScheduleIds();
    })
    .on("chemicalData", function (chemData) {
        //update chemistry
        poolSpaInfo.chemistry.isValid = chemData.isValid || poolSpaInfo.chemistry.isValid;
        poolSpaInfo.chemistry.error = chemData.error || poolSpaInfo.chemistry.error;
        poolSpaInfo.chemistry.calciumLSI = chemData.calcium || poolSpaInfo.chemistry.calciumLSI;
        poolSpaInfo.chemistry.cyanuric = chemData.cyanuricAcid || poolSpaInfo.chemistry.cyanuric;
        poolSpaInfo.chemistry.alkalinity = chemData.alkalinity || poolSpaInfo.chemistry.alkalinity;
    })
    .on("loginFailed", function () {
      //Handle login failure
      console.log("Unable to login...refreshing client.");
      client.close();
      findScreenLogic();
      poolSpaChangeListner();
    });
  client.connect();
  // getAllSchedules(client);
}

function setPoolModeOn() {
  setNewCircuitState(505, 1);
}

function setPoolModeOff() {
  setNewCircuitState(505, 0);
}

function setSpaModeOn() {
  setNewCircuitState(500, 1);
}

function setSpaModeOff() {
  setNewCircuitState(500, 0);
}

function lightFunction(message) {
  const client = getSlClient();
  client
    .on("loggedIn", function () {
      console.log("Logged in");
      this.sendLightCommand(clientInt, message);
      console.log("Light Command sent");
    })
    .on("sentLightCommand", function () {
      console.log("Light Command Acknowledged");
      client.close();
    })
    .on("loginFailed", function () {
      console.log("Unable to login... refreshing client.");
      client.close();
      // findScreenLogic();
    });
  client.connect();
}

// Pump Info
// Pump info moved to main info call
// function getPumpStatus(pumpId, initial = true){
//   // const pumps = poolSpaInfo.controllerConfig.pumps
//   // console.log(pumpId)
//     const client = getSlClient();
//     client.on("loggedIn", function (){
//       if(!initial){
//         this.addClient(1240 + pumpId);
//       }
//       console.log('Pump Status Poll...')
//       this.getPumpStatus(pumpId);
//     })
//     .on('getPumpStatus', function(pumpData){
//       console.log('Got Pump Status')
//       var pumpTypeName = "Unknown Pump Type";
//       if(pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVF){
//         pumpTypeName = "IntelliFlo VF"
//       } else if (pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVS){
//         pumpTypeName = "IntelliFlo VFS"
//       } else if (pumpData.pumpType === ScreenLogic.PUMP_TYPE_INTELLIFLOVSF){
//         pumpTypeName = "IntelliFlo VS"
//       };
//       console.log(pumpTypeName);
//       rawObjects.pumps = {
//         [pumpId] : pumpData
//       };
//       poolSpaInfo.status.pumps = {
//         [pumpId] : {
//           pumpSetting : pumpData.pumpSetting,
//           pumpType: pumpData.pumpType,
//           isRunning: pumpData.isRunning,
//           pumpTypeName: pumpTypeName,
//           pumpWatts: pumpData.pumpWatts,
//           pumpRPMs: pumpData.pumpRPMs,
//           pumpGPMs: pumpData.pumpGPMS,
//           pumpUnknown1: pumpData.pumpUnknown1,
//           pumpUnknown2: pumpData.pumpUnknown2
//         }
//       };
//       // console.log(poolSpaInfo.status.pumps);
//       if(initial){
//         client.close();
//       }
//     })
//     client.connect();

    
// }


// Schedule support
// At some point in the future, when I get good at node.js, I'll refactor...
// function getAllSchedules(scheduleType, initial = true) {
//   const client = getSlClient();
//   var scheduleTypeName = scheduleTypeMap[scheduleType];
//   client
//     .on("loggedIn", function () {
//       if(!initial){
//         this.addClient(1300 + scheduleType);
//       }
//       this.getScheduleData(scheduleType);
//       if(initial){
//         console.log('Poll for ' + scheduleTypeName)
//       }
//     })
//     .on("getScheduleData", function (schedules) {
//       console.log("Getting schedule info...");
//       poolSpaInfo.schedules[scheduleTypeName] = schedules.events;
//       aggregateScheduleIds();
//       if(initial){
//         client.close();
//     }
//     })
//     .on("loginFailed", function () {
//       console.log("Unable to login...");
//       client.close();
//     });
//   client.connect();
  
// };
function aggregateScheduleIds() {
  const schedulesKeys = Object.keys(poolSpaInfo.schedules);
  var currentSchedIds = new Set();
    schedulesKeys.forEach(function (key, i) {
      poolSpaInfo.schedules[key].forEach(function (e, i) {
        if(e.scheduleId){
          currentSchedIds.add(e.scheduleId);
        }
        })
      });
    poolSpaInfo.schedules.eventIds = currentSchedIds;
    console.log(poolSpaInfo.schedules.eventIds)
    return;
}

// Express.js endpoint logic below this line
// --------------------------------

const error503Object = {
  code: "503",
  message:
    "Server has not completed its initial data load... please try again in a moment.",
};



app.listen(expressPort, function () {
  if (slIpAddress && slPort) {
    console.log(
      "Connecting to ScreenLogic at " +
        slIpAddress +
        " on port " +
        slPort +
        "..."
    );
  } else {
    console.log("Finding Screenlogic Units...");
  }
  findScreenLogic();
  // console.log(
  //   "Pool data update interval is " + pollInterval / 1000 + " seconds."
  // );
  //This fixes the startup, but a one second delay is silly, this should be event driven...

  //Initial Call
  setTimeout(function() {
    getAllpoolSpaInfo();
  }, 1000)

  setTimeout(function(){
    poolSpaChangeListner();
  }, 5000)

  setInterval(function() {
    getAllpoolSpaInfo();
  }, 600000)
  
  // aggregateScheduleIds();
  // setInterval(function () {
  //   console.log('Polling...')
  //   if (!poolSpaInfo.meta.pollInProgress){
  //     getAllpoolSpaInfo();
  //     if (poolSpaInfo.meta.successfulPolling){
  //       aggregateScheduleIds();

      // }
  //     poolSpaInfo.meta.skippedPolls = 0;
  //   } else {
  //     console.log('Poll already Scheduled...skipping this polling loop.')
  //     poolSpaInfo.meta.skippedPolls++;
  //     console.log("Skipped " + poolSpaInfo.meta.skippedPolls + " polling loops...")
  //     if(poolSpaInfo.meta.skippedPolls >= maxPollSkip){
  //       console.log('Max Skipped polls reached, forcing poll on next cycle...')
  //       poolSpaInfo.meta.skippedPolls = 0;
  //       poolSpaInfo.meta.pollInProgress = false;
  //     }
  //   }
  // }, pollInterval);
  
  console.log("Express server listening on port " + expressPort);
});

app.get("/health", function (req, res) {
  const response = {
    healthy: poolSpaInfo.meta.successfulPolling,
  };
  res.json(response);
  console.log("Returned " + req.method + " " + req.route.path);
});

app.get(baseApiPath + "/all", function (req, res) {
  if (poolSpaInfo.meta.successfulPolling) {
    res.json(poolSpaInfo);
    console.log("Returned " + req.method + " " + req.route.path);
  } else {
    res.json(error503Object);
  }
});

app.get(baseApiPath + "/raw", function (req, res) {
  console.log(req.ip);
  // console.log('All Pool Info: ' + poolSpaInfo);
  res.json(rawObjects);
  console.log("Returned " + req.method + " " + req.route.path);
});

app.put(baseApiPath + "/pool/on", function (req, res) {
  console.log(req.ip);
  setPoolModeOn();
  const response = {
    body: "pool",
    action: "turn on",
    sent: true,
  };
  console.log("Sent poolOn to ScreenLogic");
  res.json(response);
  console.log("Returned " + req.method + " " + req.route.path);
});

app.put(baseApiPath + "/pool/off", function (req, res) {
  console.log(req.ip);
  setPoolModeOff();
  var response = {
    body: "pool",
    action: "off",
    sent: true,
  };
  console.log("Sent poolOff to ScreenLogic");
  res.json(response);
  console.log("Returned " + req.method + " " + req.route.path);
});

app.put(baseApiPath + "/spa/on", function (req, res) {
  console.log(req.ip);
  setSpaModeOn();
  var response = {
    body: "spa",
    action: "on",
    sent: true,
  };
  console.log("Sent spaOn to ScreenLogic");
  res.json(response);
  console.log("Returned " + req.method + " " + req.route.path);
  return;
});

app.put(baseApiPath + "/spa/off", function (req, res) {
  console.log(req.ip);
  setSpaModeOff();
  const response = {
    body: "spa",
    action: "off",
    sent: true,
  };
  console.log("Sent spaOff to ScreenLogic");
  res.json(response);
  console.log("Returned " + req.method + " " + req.route.path);
});

app.put(baseApiPath + "/lights/:command", function (req, res) {
  // console.log(req.params.command)
  console.log('Got PUT command for lights: ' + req.params.command)
  if(!req.params.command || req.params.command < 0 || req.params.command > 17){
    res
    .status(406)
    .send(
      '{"Error" : "The format of this request is ../lights/<command>. Command should be an integer between 0 and and 17, which corresponds to the various light commands available. Please see documentation for lights."}'
    );
  return; 
  }
  lightFunction(req.params.command);
  const response = {
    lightCommand: req.params.command,
  };
  res.status(200).send(response);
});

app.put(baseApiPath + "/circuit/:circuit/:state", function (req, res) {
  console.log(req.ip);
  console.log(req.params);
  const changeCircuit = parseInt(req.params.circuit);
  let stateInt = null;
  if (!req.params.circuit || !req.params.state) {
    res
      .status(406)
      .send(
        '{"Error" : "The format of this request is /api/v1/circuit/<circuitNumber>/<state>. Circuit should be the number of the circuit, an integer between 500 and 600. State should be 0 (off) or 1 (on)."}'
      );
    return;
  }
  if (req.params.state.toUpperCase() === "ON" || req.params.state === "1") {
    stateInt = 1;
  } else if (
    req.params.state.toUpperCase() === "OFF" ||
    req.params.state === "0"
  ) {
    stateInt = 0;
  } else {
    res.status(418).send('{"Error" : "State should be 0 (off) or 1(on)."}');
    return;
  }
  if (req.params.circuit < 500 || req.params.circuit > 599) {
    res
      .status(418)
      .send('{"Error" : "Circuit should be an integer between 500 and 600"}');
    return;
  }
  setNewCircuitState(changeCircuit, stateInt);
  const response = {
    circuit: changeCircuit,
    newState: stateInt,
  };
  res.status(200).send(response);
  console.log("Returned " + req.method + " " + req.route.path);
});

const bodyTypeError = {
  code: 418,
  message: "Invalid target body",
  info: "Valid target bodies are 'pool' or 'spa'",
};

app.put(baseApiPath + "/:body/heater/setpoint/:temp", function (req, res) {
  console.log(req.toString());
  console.log(req.params);
  res.send(req.params)
  if (poolSpaInfo.meta.successfulPolling) {
    if (req.params.body === "spa" || req.params.body === "pool") {
      const targetBody = bodyMap[req.params.body];
      const targetTemp = parseInt(req.params.temp);
      const maxTemp = parseInt(poolSpaInfo.controllerConfig.spaMaxSetPoint);
      const minTemp = parseInt(poolSpaInfo.controllerConfig.spaMinSetPoint);
      if (minTemp <= targetTemp && maxTemp >= targetTemp) {
        console.log("Valid Setpoint Temperature");
        setHeatSetPoint(targetBody, targetTemp);
        const response = {
          body: req.params.body,
          newSetpoint: targetTemp,
          success: true,
        };
        res.json(response);
        console.log("Returned " + req.method + " " + req.route.path);
      } else {
        console.log("Invalid Setpoint Temperature");
        var setPointError = {
          code: "418",
          message: "Setpoint should be between " + minTemp + " and " + maxTemp,
        };
        res.status(418).send(setPointError);
      }
    } else {
      res.status(418).send(bodyTypeError);
    }
  } else {
    res.status(503).send(error503Object);
  }
}
);

app.put(baseApiPath + "/:body/heater/mode/:mode", function (req, res) {
  // heatMode: 0: "Off", 1: "Solar", 2 : "Solar Preferred", 3 : "Heat Pump", 4: "Don't Change"
  console.log(req.params);
  if (poolSpaInfo.meta.successfulPolling) {
    if (req.params.body === "spa" || req.params.body === "pool") {
      const targetBody = bodyMap[req.params.body];
      const targetHeatMode = parseInt(req.params.mode);
      if (targetHeatMode >= 0 && targetHeatMode <= 4) {
        setHeatMode(targetBody, targetHeatMode);
        const response = {
          targetBody: req.params.body,
          newHeaterMode: targetHeatMode,
          newHeaterModeMeaning: heaterModes[targetHeatMode],
          success: true,
        };
        res.json(response);
        console.log("Returned " + req.method + " " + req.route.path);
      } else {
        const heatModeError = {
          code: "418",
          message: "Invalid Heat Mode",
          "Valid Heat Modes": heaterModes,
        };
        res.status(418).send(heatModeError);
      }
    } else {
      res.status(418).send(bodyTypeError);
    }
  } else {
    res.status(503).send(error503Object);
  }
});

app.get("/connection", function (req, res) {
  findScreenLogic();
  const slConnection = getSlClient();
  res.status(200).json(slConnection);
  console.log("Returned " + req.method + " " + req.route.path);
});

//  Schedules!
// Need to differentiate between events and run-once events (egg timers)
app.get(baseApiPath + "/schedules", function (req, res) {
  console.log("GET /schedules");
  if (poolSpaInfo.meta.successfulPolling) {
    res.json(poolSpaInfo.schedules);
    console.log("Returned " + req.method + " " + req.route.path);
  } else {
    res.status(503).send(error503Object);
  }
});

app.post(baseApiPath + "/schedules/:type", function (req, res) {
  // Schedule Types: 0 = Normal, 1 = Run Once (Egg Timer)
  console.log(req.params);
  const newScheduleReturn = {
    status: "unknown",
    scheduleId: null,
  };
  if (poolSpaInfo.meta.successfulPolling) {
    if (req.params.type === "0" || req.params.type === "1") {
      var scheduleType = parseInt(req.params.type);
      const client = getSlClient();
      client
        .on("loggedIn", function () {
          console.log("Logged in...");
          this.addNewScheduleEvent(scheduleType);
          console.log("Sending new event data...");
          // client.close();
        })
        .on("addNewScheduleEvent", function (newScheduleObj) {
          console.log(newScheduleObj);
          newScheduleReturn.status = "success";
          newScheduleReturn.scheduleId = newScheduleObj.scheduleId;
          console.log("New Schedule Event ID is " + newScheduleObj.scheduleId);
          res.status(200).json(newScheduleReturn);
          client.close();
        });
      client.connect();
      // newScheduleReturn.status = "success";
      // newScheduleReturn.scheduleId = 'poll for new schedule ID';
      // res.status(200).json(newScheduleReturn);
      // getAllSchedules(0);
      // getAllSchedules(1);
      // aggregateScheduleIds();
    } else {
      var invalidSchedTypeRes = {
        code: 418,
        message: "Invalid Schedule Type",
        info: "Valid Schedule types are 0 (Daily) or 1 (Run Once)",
      };
      res.status(418).send(invalidSchedTypeRes);
    }
  } else {
    res.status(503).send(error503Object);
  }
  return;
});

//Delete a Schedule
//ToDo: Implement delete queue, as SL cannot be relied on to delete in a timely manner.
app.delete(baseApiPath + "/schedules/:id", function (req, res) {
  console.log(req.params);
  var scheduleId = Number(req.params.id);
  //Check to make sure the schedule ID exists...
  if (poolSpaInfo.meta.successfulPolling) {
    if (poolSpaInfo.schedules.eventIds.has(scheduleId)) {
      const client = getSlClient();
      client
        .on("loggedIn", function () {
          console.log("Logged in...");
          this.deleteScheduleEventById(scheduleId);
          console.log("Sent delete schedule for ID " + scheduleId);
          client.close();
        });
      client.connect();
      const message = "Successfully deleted schedule ID " + scheduleId;
      console.log(message);
      const response = {
        code: 200,
        message: message,
      };
      // getAllSchedules(0);
      // getAllSchedules(1);
      // aggregateScheduleIds();
      res.json(response);
    } else {
      const response = {
        code: 404,
        message: "Schedule ID Not Found",
        scheduleId: scheduleId,
      };
      res.status(404).send(response);
    }
  } else {
    res.status(503).send(error503Object);
  }
  return;
});

app.put(baseApiPath + "/schedules/:id", function (req, res) {
  console.log(req.params);
  // console.log(req.body.days)
  var scheduleId = req.params.id;
  var scheduleExists = false;
  if (poolSpaInfo.meta.successfulPolling) {
    poolSpaInfo.schedules.events.forEach(function (e, i) {
      if (e.scheduleId == scheduleId) {
        console.log("Schedule Exists");
        scheduleExists = true;
      }
    });
    if (scheduleExists) {
      const client = getSlClient();
      client
        .on("loggedIn", function (helper) {
          console.log("Logged in...");
          const scheduleObject = {
            scheduleId: req.params.id,
            circuitId: req.body.circuitId,
            startTime: req.body.startTime,
            stopTime: req.body.stopTime,
            days: req.body.days,
            dayMask: helper.encodeDayMask(req.body.days),
            flags: req.body.flags,
            heatCmd: req.body.heatCmd,
            heatSetPoint: req.body.heatSetPoint,
          };
          this.setScheduleEventById(scheduleObject);
        })
        .on("setScheduleEventById", function (updatedSchedObj) {
          console.log(updatedSchedObj);
          var message = "Successfully updated schedule ID " + scheduleId;
          console.log(message);
          var response = {
            code: 200,
            message: message,
          };
        });
      client.connect();
    } else {
      const response = {
        code: 404,
        message: "Could not update Schedule, ID Not Found",
        scheduleId: scheduleId,
      };
      res.status(404).send(response);
    }
    // res.send('works')
  } else {
    res.status(503).send(error503Object);
  }
});
