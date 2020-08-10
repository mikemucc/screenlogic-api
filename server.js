#!/usr/bin/env node
"use strict";

const { equipFlagsMeanings } = require("./equipFlagsMeanings");
const express = require("express");
const app = express();
// const bodyParser = require('body-parser');
const expressPort = process.env.PORT || 3000;
const ScreenLogic = require("node-screenlogic");
const cors = require("cors");
const nodeScreenlogic = require("node-screenlogic");
const { SLControllerConfigMessage } = require("node-screenlogic/messages");
app.use(cors());
app.use(express.json());
// defaulting to 5 second poll intervals.
// Override with POLL_INTERVAL environment variable.
const pollInterval = process.env.POLL_INTERVAL || 5000;
const baseApiPath = process.env.BASE_PATH || "/api";
// Read other Configs from the Environment
let slIpAddress = process.env.SL_IP_ADDRESS || null;
let slPort = process.env.SL_PORT || 80;
let slName = process.env.SL_NAME || null;
const featuresInterface = process.env.FEATURES_LOCATION || "features";

const clientInt = 0;

const commonCircuitMap = {
  pool: 505,
  "505": "pool",
  spa: 500,
  "500": "spa",
};

//quick way to convert body integer to name.
const bodyMap = {
  "0": "pool",
  pool: 0,
  "1": "spa",
  spa: 1,
};

const poolSpaInfo = {
  meta: {
    lastUpdated: null,
    tempInCelcius: null,
    successfulPolling: false,
    initialLoad: false,
    server: {
      ipAddress: null,
      port: null,
      name: null,
    },
  },
};

// const scheduleInfo = {};

// I need an object in the global context to keep track of new schedule IDs because... javascript.
// var newScheduleId = null;

const rawObjects = {
  meta: {
    lastUpdated: null,
  },
};
const heaterModes = {
  "0": "Off",
  "1": "Solar",
  "2": "Solar Preferred",
  "3": "Heat Pump",
  "4": "Don't Change",
};
const heaterStatus = {
  "0": "Off",
  "1": "Solar Heater On",
  "2": "Heat Pump On",
};

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
      getAllpoolSpaInfo();
    })
    .on("loginFailed", function () {
      console.log("Unable to login... refreshing client.");
      client.close();
      // findScreenLogic();
    });
  client.connect();
}

function setHeatSetPoint(body, temp) {
  const client = getSlClient();
  // console.log(body);
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
      getAllpoolSpaInfo();
    })
    .on("loginFailed", function () {
      console.log("Unable to login...");
      client.close();
      // findScreenLogic();
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
      getAllpoolSpaInfo();
    })
    .on("loginFailed", function () {
      console.log("Unable to login...refreshing client.");
      client.close();
      findScreenLogic();
    });
  client.connect();
}

function getAllpoolSpaInfo() {
  const client = getSlClient();
  const pollTime = Date.now();
  client
    .on("loggedIn", function () {
      // console.log('Getting all info...')
      // console.log(client.challengeString.substr(9))
      if (!poolSpaInfo.meta.server.name) {
        poolSpaInfo.meta.server.name =
          "Pentair: " + client.challengeString.substr(9);
      }
      this.getVersion();
      this.getPoolStatus();
      this.getChemicalData();
      this.getSaltCellConfig();
      this.getControllerConfig();
      this.getScheduleData(0);
      this.getScheduleData(1);

    })
    .on("version", function (version) {
      // console.log(version)
      poolSpaInfo.firmware = {
        version: version.version,
      };
      // console.log(' version=' + version.version);
    })
    .on("poolStatus", function (status) {
      poolSpaInfo.meta.airTemp = status.airTemp;
      poolSpaInfo.meta.activeAlarms = status.alarms;
      poolSpaInfo.meta.serviceMode = status.isDeviceServiceMode();
      poolSpaInfo.meta.freezeMode = status.freezeMode;
      poolSpaInfo.meta.cleanerDelay = status.cleanerDelay;
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
    })
    .on("saltCellConfig", function (saltCellConfig) {
      poolSpaInfo.saltCell = {
        installed: saltCellConfig.installed,
        status: saltCellConfig.status,
        saltLevel: saltCellConfig.salt,
      };
      rawObjects.saltCellConfig = saltCellConfig;
    })
    .on("getScheduleData", function (schedules) {
      // console.log("Getting schedule info...");
      // console.log(schedules);
      if (schedules.events != []){
        const events = schedules.events
        // console.log(events)
        if (events[0].flags === 0 || events[0].flags === 2){
          console.log('Got callback with schedules');
          poolSpaInfo.schedules = {
            schedules : schedules,
            lastUpdated : pollTime 
          }
        } else {
          console.log('Got callback with eggtimer data');
          poolSpaInfo.schedules = {
            eggTimers : schedules,
            lastUpdated : pollTime
          }
        }
      };
    })
    .on("controllerConfig", function (config) {
      var pumps = config.pumpCircArray;
      // Object.keys(pumps).forEach(function(key){
      //   if(pumps[key] != 0){
      //     this.getPumpStatus(key)
      //   }
      // })
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
      poolSpaInfo.chemistry.intellichemInstalled =
        poolSpaInfo.controllerConfig.equipPresent.intellichem;
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

      poolSpaInfo.meta.lastUpdated = pollTime;
      rawObjects.meta.lastUpdated = pollTime;
      if (!poolSpaInfo.meta.successfulPolling) {
        console.log("Initial State Data loaded from ScreenLogic.");
        // console.log('\n')
        // console.log(poolSpaInfo)
        // console.log('\n')
      }
      poolSpaInfo.meta.successfulPolling = true;
      // console.log('Info Refreshed')
      client.close();
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
exports.poolSpaInfo = poolSpaInfo;

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
    })
    .on("sentLightCommand", function () {
      console.log("Light Command sent");
    })
    .on("sentLightCommand", function () {
      console.log("Light Command Acknowledged");
      client.close();
      getAllpoolSpaInfo();
    })
    .on("loginFailed", function () {
      console.log("Unable to login... refreshing client.");
      client.close();
      // findScreenLogic();
    });
  client.connect();
}


// Schedule support
// At some point in the future, when I get good at node.js, I'll refactor...
// function getAllSchedules() {

//   const client = getSlClient();
//   client
//     .on("loggedIn", function () {
//       this.getScheduleData();
//     })
//     .on("getScheduleData", function (schedules) {
//       console.log("Getting schedule info...");
//       poolSpaInfo.schedules = schedules;
//       // scheduleInfo.schedules = schedules;
//       // scheduleInfo.schedules.lastUpdated = Date.now();
//       client.close();
//     })
//     .on("LoginFailed", function () {
//       console.log("Unable to login...");
//       client.close();
//     });
//   client.connect();
// }

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
  console.log(
    "Pool data update interval is " + pollInterval / 1000 + " seconds."
  );
  setInterval(function () {
    getAllpoolSpaInfo();
  }, pollInterval);
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
  getAllpoolSpaInfo();
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
  console.log(req.params);
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
      };
    } else {
      res.status(418).send(bodyTypeError);
    };
  } else {
    res.status(503).send(error503Object);
  };
});

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
      };
    } else {
      res.status(418).send(bodyTypeError);
    };
  } else {
    res.status(503).send(error503Object);
  };
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
  console.log('GET /schedules');
  if (poolSpaInfo.meta.successfulPolling) {
    const activeSchedules = {
      schedules: poolSpaInfo.schedules.schedules,
      eggTimers: poolSpaInfo.schedules.eggTimers,
    };
    res.json(activeSchedules);
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
          console.log('Sending new event data...');
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
    } else {
      var invalidSchedTypeRes = {
        code: 418,
        message: "Invalid Schedule Type",
        info: "Valid Schedule types are 0 (Daily) or 1 (Run Once/Egg Timer)",
      };
      res.status(418).send(invalidSchedTypeRes);
    };
  }
  else {
    res.status(503).send(error503Object);
  }
  return;
});


app.delete(baseApiPath + "/schedules/:id", function (req,res){
  console.log(req.params);
  var scheduleId = req.params.id;
  const client = getSlClient();
  client
    .on("loggedIn", function () {
      console.log("Logged in...");
      this.deleteScheduleEventById(scheduleId);
      console.log('Sent delete schedule for ID ' + scheduleId);
    })
      .on("deleteScheduleEventById", function(){
        const message = "Successfully deleted schedule ID " + scheduleId;
        console.log(message);
        const response = {
          code: 200,
          message: message,
        };
        res.json(response);
        client.close();
      })
    client.connect();
    return;
      
})

app.delete(baseApiPath + "/schedules/:id", function (req, res) {
  console.log(req.params);
  var scheduleId = req.params.id;
  var scheduleExists = true;
  // if (poolSpaInfo.meta.successfulPolling) {
  //   poolSpaInfo.schedules.events.forEach(function (e, i) {
  //     if (e.scheduleId == scheduleId) {
  //       console.log("Schedule Exists");
  //       scheduleExists = true;
  //     }
  //   });
    if (scheduleExists) {
      const client = getSlClient();
      client
        .on("loggedIn", function () {
          console.log("Logged in...");
          this.deleteScheduleEventById(scheduleId);
          console.log('Sent delete schedule for ID ' + scheduleId);
        })
        .on("deleteScheduleEventById", function (delSchedObj) {
          console.log(delSchedObj);
          const message = "Successfully deleted schedule ID " + scheduleId;
          console.log(message);
          const response = {
            code: 200,
            message: message,
          };
          res.json(response);
          client.close();
        });
      client.connect();
    } else {
      const response = {
        code: 404,
        message: "Schedule ID Not Found",
        scheduleId: scheduleId,
      };
      res.status(404).send(response);
    };
  // } else {
  //   res.status(503).send(error503Object);
  // }
  return;
});

app.put(baseApiPath + "/schedules/:id", function (req, res){
  console.log(req.params)
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
  if(scheduleExists){
    const client = getSlClient();
      client
        .on("loggedIn", function (helper) {
          console.log("Logged in...");
          const scheduleObject = {
            scheduleId : req.params.id,
            circuitId : req.body.circuitId,
            startTime : req.body.startTime,
            stopTime : req.body.stopTime,
            days : req.body.days,
            dayMask: helper.encodeDayMask(req.body.days),
            flags : req.body.flags,
            heatCmd : req.body.heatCmd,
            heatSetPoint: req.body.heatSetPoint
          }
          this.setScheduleEventById(scheduleObject);
        }).on("setScheduleEventById", function(updatedSchedObj){
          console.log(updatedSchedObj);
          var message = "Successfully updated schedule ID " + scheduleId;
          console.log(message);
          var response = {
            code: 200,
            message: message,
          };

        });
    client.connect()
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
