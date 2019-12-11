#!/usr/bin/env node
'use strict';

var express = require('express');
var app = express();
var expressPort = process.env.PORT || 3000;
const ScreenLogic = require('node-screenlogic');
//defaulting to 5 second poll intervals. 
// Override with POLL_INTERVAL environment variable.
const pollInterval = process.env.POLL_INTERVAL || 5000;
const baseApiPath = process.env.BASE_PATH || '/api';
// Read other Configs from the Environment
var slIpAddress = process.env.SL_IP_ADDRESS || null;
var slPort = process.env.SL_PORT || 80;
var slName = process.env.SL_NAME || null;
var featuresInterface = process.env.FEATURES_LOCATION || 'features';
// if (process.env.SL_IP_ADDRESS && process.env.SL_PORT){
//   console.log('Got Screenlogic IP address and Port from the Environment.')
// }

const clientInt = 0;

const commonCircuitMap = {
  'pool' : 505,
  '505' : 'pool',
  'spa' : 500,
  '500' : 'spa'
}

//quick way to convert body integer to name.
const bodyMap = {
  "0" : 'pool',
  'pool' : 0,
  "1" : 'spa',
  "spa" : 1,
}

const poolSpaInfo = {
  'meta' : 
    {
      'lastUpdated' : null,
      'tempInCelcius' : null,
      'successfulPolling' : false,
      'server' : {
        'ipAddress' : null,
        'port' : null,
        'name' : null
      }
    }
};

const rawObjects = {
  'meta' : 
  {
    'lastUpdated' : null
  }
};
const rawPumpStatus = {}
const heaterModes = {
  "0" : "Off",
  "1" : "Solar",
  "2" : "Solar Preferred",
  "3" : "Heat Pump",
  "4" : "Don't Change"
}
const heaterStatus = {
  "0" : 'Off',
  "1" : 'Solar Heater On',
  "2" : "Heat Pump On"
}



function findScreenLogic(){
  if (slIpAddress && slPort){
    // console.log(server)
    // console.log(connection);
    console.log('Got Screenlogic IP address and Port from the Environment.')
    poolSpaInfo.meta.server = {
      "ipAddress" : slIpAddress,
      "port" : slPort,
      "name" : slName,
    }
    if (slName){
      poolSpaInfo.meta.server.name = slName;
    }
  } else {
    var finder = new ScreenLogic.FindUnits();
    finder.search();
    finder.on('serverFound', function(server) 
        {
          console.log('Found ScreenLogic unit at: ' + server.address + ':' + server.port);
          poolSpaInfo.meta.server = {
            "ipAddress" : server.address,
            "port" : server.port,
            "name" : server.gatewayName
          }
        finder.close();
      }
    );
  };
}

function getSlClient(){
  var slIpAddress = poolSpaInfo.meta.server.ipAddress
  var slPort = poolSpaInfo.meta.server.port
  return new ScreenLogic.UnitConnection(slPort, slIpAddress)
}


function setHeatMode(body, heatMode){
  // Body: pool = 0; spa = 1
  // heatMode: 0: "Off", 1: "Solar", 2 : "Solar Preferred", 3 : "Heat Pump", 4: "Don't Change"
  var client = getSlClient();
  var heatBody = bodyMap[body]
  client.on('loggedIn', function(){
    console.log('Logged in, setting heater state for ' + heatBody + ' to ' + heaterModes[heatMode])
    this.setHeatMode(clientInt, body, heatMode);
  }).on('heatModeChanged', function() {
    console.log("Changed " + heatBody + " heater state to " + heaterModes[heatMode])
    client.close();
  }).on('loginFailed', function() {
    console.log('Unable to login... refreshing client.');
    client.close();
    findScreenLogic();
  });
  client.connect();
}

function setHeatSetPoint(body, temp){
  var client = getSlClient();
  console.log(client);
  var heatBody = bodyMap[body];
  console.log('Setting heater setpoint for ' + heatBody + ' to ' + temp + ' degrees.');
  client.on('loggedIn', function(){
      console.log('Logged in...');
      this.setSetPoint(clientInt, body, temp);
    }).on('setPointChanged', function(){
      console.log(heatBody + ' setpoint Successfully changed to ' + temp)
    }).on('loginFailed', function() {
      console.log('Unable to login... refreshing client.');
    client.close();
    findScreenLogic();
  });
  client.connect();
}

function setNewCircuitState(circuitId, state){
  var client = getSlClient();
  console.log('Invoking change state with state = ' + state +' and circuit ID = ' + circuitId)
  client.on('loggedIn', function(){
      console.log('Logged in, sending state ' + state +' to circuit ID ' + circuitId)
      this.setCircuitState(clientInt, circuitId, state);
    }).on('circuitStateChanged', function() {
      var newState = (state == 0 ) ? 'off' : 'on';
      console.log(`Circuit ${circuitId} set to ${newState}.`);
      client.close();
    }).on('loginFailed', function() {
      console.log('Unable to login...refreshing client.');
    client.close();
    findScreenLogic();
  });
  client.connect()
};

function getAllpoolSpaInfo(){
  var client = getSlClient();
  client.on('loggedIn', function() {
      // console.log('Getting all info...')
      // console.log(client.challengeString.substr(9))
      if(!poolSpaInfo.meta.server.name){
        poolSpaInfo.meta.server.name = 'Pentair: ' + client.challengeString.substr(9)
      }
      this.getVersion();
    }).on('version', function(version) {
      this.getPoolStatus();
      // console.log(version)
      poolSpaInfo.firmware= {
        'version' : version.version
      };
      // console.log(' version=' + version.version);
    }).on('poolStatus', function(status) {
      this.getChemicalData();
      poolSpaInfo.meta.airTemp = status.airTemp;
      poolSpaInfo.meta.activeAlarms = status.alarms;
      poolSpaInfo.meta.serviceMode = status.isDeviceServiceMode();
      poolSpaInfo.meta.freezeMode = status.freezeMode;

      poolSpaInfo.status = {
        'bodies': [
          { 
            'name' : 'pool',
            'circuitId' : commonCircuitMap.pool,
            'interfaceId' : 0,
            'altInterfaceId' : (featuresInterface.toLowerCase() == 'pool') ? 2 : 0,
            'waterTemp' : status.currentTemp[0],
            'active' : status.isPoolActive(),
            'airTemp' : status.airTemp,
            'heater' : {
              'modeCode' : status.heatMode[0],
              'mode' : heaterModes[status.heatMode[0]],
              'active' : (status.heatStatus[0] > 0),
              'activeCode' : status.heatStatus[0],
              'activeType' : heaterStatus[status.heatStatus[0]],
              'setpoint' : status.setPoint[0],
            }
          },
          { 
            'name' : 'spa',
            'circuitId' : commonCircuitMap.spa,
            'interfaceId' : 1,
            'altInterfaceId' : (featuresInterface.toLowerCase() == 'spa') ? 2 : 1,
            'waterTemp' : status.currentTemp[1],
            'active' : status.isSpaActive(),
            'airTemp' : status.airTemp,
            'heater' : {
              'modeCode' : status.heatMode[1],
              'mode' : heaterModes[status.heatMode[1]],
              'active' : (status.heatStatus[1] > 0),
              'activeCode' : status.heatStatus[1],
              'activeType': heaterStatus[status.heatStatus[1]],
              'setpoint' : status.setPoint[1],
            },
          }
          ],
          'device' : {
            'currentStatus' : status.ok,
            'ready' : status.isDeviceReady(),
            'sync' : status.isDeviceSync(),
            'activeAlarms' : status.alarms,
            'serviceMode' : status.isDeviceServiceMode(),
            'freezeMode' : status.freezeMode,
          },
          'chemistry' : {
            'saltPPM' : status.saltPPM,
            'ph' : status.pH,
            'calciumSaturation' : status.saturation,
          },
          'circuits' : status.circuitArray
        };
        rawObjects.status = status;
    }).on('chemicalData', function(chemData) {
      this.getSaltCellConfig();
      poolSpaInfo.chemistry = {
          'info'  : 'This data only valid if IntelliChem in installed',
          'isValid' : chemData.isValid,
          'error' : chemData.error,
          'calciumLSI' : chemData.calcium,
          'cyanuric' : chemData.cyanuricAcid,
          'alkalinity' : chemData.alkalinity
        };
      rawObjects.chemData = chemData;
    }).on('saltCellConfig', function(saltCellConfig) {
      this.getControllerConfig();
      poolSpaInfo.saltCell = {
          'installed' : saltCellConfig.installed,
          'status' : saltCellConfig.status,
          'saltLevel' : saltCellConfig.salt
      };
      rawObjects.saltCellConfig = saltCellConfig;
    }).on('controllerConfig', function(config) {
      poolSpaInfo.meta.tempInCelcius = config.degC;
      poolSpaInfo.controllerConfig = {
        'tempInCelcius' : config.degC,
        'tempScale' : (config.degC) ? 'C' : 'F',
        'pumps' : config.pumpCircArray,
        'bodyArray' : config.bodyArray,
        'controllerId' : config.controllerId,
        'poolMinSetPoint' : config.minSetPoint[0],
        'poolMaxSetPoint' : config.maxSetPoint[0],
        'spaMinSetPoint' : config.minSetPoint[1],
        'spaMaxSetPoint' : config.maxSetPoint[1],
        'interfaceTabFlags' : config.interfaceTabFlags
      };
      poolSpaInfo.status.bodies.forEach(v => {v.tempScale= (config.degC) ? 'C' : 'F';});
      poolSpaInfo.meta.tempScale = (config.degC) ? 'C' : 'F'
      rawObjects.config = config
      poolSpaInfo.controllerConfig.bodyArray.forEach(
        c => {
          poolSpaInfo.status.circuits.forEach(
            z => {
              if(c.circuitId == z.id){
                // console.log(c.circuitId)
                c.state = z.state
                c.delay = z.delay
              }
            }
          )
        }
      )

      poolSpaInfo.meta.lastUpdated = Date.now();
      rawObjects.meta.lastUpdated = Date.now();
      if (!poolSpaInfo.meta.successfulPolling){
        console.log("Initial State Data loaded from ScreenLogic.")
        // console.log('\n')
        // console.log(poolSpaInfo)
        // console.log('\n')
      }
      poolSpaInfo.meta.successfulPolling = true;
      // console.log('Info Refreshed')
      client.close();
    }).on('loginFailed', function() {
      console.log('Unable to login...refreshing client.');
      client.close();
      findScreenLogic();
    });
    client.connect();
};

function setPoolModeOn() {
  setNewCircuitState(505, 1)
};

function setPoolModeOff() {
  setNewCircuitState(505, 0)
};

function setSpaModeOn() {
  setNewCircuitState(500, 1)
};

function setSpaModeOff() {
  setNewCircuitState(500, 0)
};



// Express.js endpoint logic below this line
// --------------------------------

const error503Object = {
  "code" : "503",
  "message" : "Server has not completed its initial data load... please try again in a moment."
}

var server = app.listen(expressPort, function(){
  if(slIpAddress && slPort){
    console.log('Connecting to ScreenLogic at ' + slIpAddress + ' on port ' + slPort + '...')
  } else {
    console.log('Finding Screenlogic Units...');
  }
  findScreenLogic();
  // sleep(5000);
  console.log('Pool data update interval is ' + pollInterval/1000 + ' seconds.')
  setInterval(function() {
    getAllpoolSpaInfo();
  }, pollInterval);
  // if(!poolSpaInfo.meta.successfulPolling){
  //   sleep(5000)
  // };
  console.log("Express server listening on port " + expressPort)
});

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/health', function(req, res){
    var response = {
      'healthy' : poolSpaInfo.meta.successfulPolling
    }
    res.json(response);
    console.log('Returned ' + req.method + ' ' + req.route.path);
});


app.get(baseApiPath + '/all', function(req, res){
  console.log(req.ip);
  // console.log('All Pool Info: ' + poolSpaInfo);
  if(poolSpaInfo.meta.successfulPolling){
    res.json(poolSpaInfo);
    console.log('Returned ' + req.method + ' ' + req.route.path);
  } else {
    res.json(error503Object)
  }
});

app.get(baseApiPath + '/raw', function(req, res){
  console.log(req.ip);
  // console.log('All Pool Info: ' + poolSpaInfo);
  res.json(rawObjects);
  console.log('Returned ' + req.method + ' ' + req.route.path);
});

app.put(baseApiPath + '/pool/on', function(req,res){
  console.log(req.ip);
  setPoolModeOn();
  var response = {
    'body' : 'pool',
    'action' : 'turn on',
    'sent' : true
  }
  console.log('Sent poolOn to ScreenLogic')
  res.json(response)
  console.log('Returned ' + req.method + ' ' + req.route.path);
})

app.put(baseApiPath + '/pool/off', function(req,res){
  console.log(req.ip);
  setPoolModeOff();
  var response = {
    'body'  : 'pool',
    'action' : 'off',
    'sent' : true
  }
  console.log('Sent poolOff to ScreenLogic')
  res.json(response)
  console.log('Returned ' + req.method + ' ' + req.route.path);
});

app.put(baseApiPath + '/spa/on', function(req,res){
  console.log(req.ip);
  setSpaModeOn();
  var response = {
    'body'  : 'spa',
    'action' : 'on',
    'sent' : true
  }
  console.log('Sent poolOn to ScreenLogic')
  res.json(response)
  console.log('Returned ' + req.method + ' ' + req.route.path);
})

app.put(baseApiPath + '/spa/off', function(req,res){
  console.log(req.ip);
  setSpaModeOff();
  var response = {
    'body'  : 'spa',
    'action' : 'off',
    'sent' : true
  }
  console.log('Sent poolOff to ScreenLogic')
  res.json(response)
  console.log('Returned ' + req.method + ' ' + req.route.path);
});

app.put(baseApiPath + '/:circuit/:state', function(req,res){
  console.log(req.ip);
  console.log(req.params);
  var changeCircuit = parseInt(req.params.circuit);
  var stateInt = null;
  if (!req.params.circuit || !req.params.state){
    res.status(406).send('{"Error" : "The format of this request is /api/v1/circuit/state. Circuit should be the number of the circuit, an integer between 500 and 600. State should be 0 (off) or 1 (on)."}');
    return;
  }
  if (req.params.state.toUpperCase() == 'ON' || req.params.state == "1"){
    stateInt = 1;
  } else if (req.params.state.toUpperCase() == 'OFF' || req.params.state == "0"){
    stateInt = 0;
  } else if (!stateInt){
    res.status(418).send('{"Error" : "State should be 0 (off) or 1(on)."}');
    return;
  }
  if (req.params.circuit < 500 || req.params.circuit > 599){
    res.status(418).send('{"Error" : "Circuit should be an integer between 500 and 600"}');
    return
  }
  setNewCircuitState(changeCircuit, stateInt)
  getAllpoolSpaInfo();
  var response = {
    "circuit" : changeCircuit,
    "newState" : stateInt
  }
  res.status(200).send(response)
  console.log('Returned ' + req.method + ' ' + req.route.path);
});
var bodyTypeError = {
  "code" : 418,
  "message" : "Invalid target body",
  "info" : "Valid target bodies are 'pool' or 'spa'"
}

app.put(baseApiPath + '/:body/heater/setpoint/:temp', function(req, res){
  console.log(req.params)
  if (poolSpaInfo.meta.successfulPolling){
    if(req.params.body == 'spa' || req.params.body == 'pool') {
      var targetBody = bodyMap[req.params.body]
      var targetTemp = parseInt(req.params.temp);
      var maxTemp = parseInt(poolSpaInfo.controllerConfig.spaMaxSetPoint);
      var minTemp = parseInt(poolSpaInfo.controllerConfig.spaMinSetPoint);
      // console.log(targetTemp)
      if (minTemp <= targetTemp && maxTemp >= targetTemp){
        console.log('Valid Setpoint Temperature')
        setHeatSetPoint(targetBody, targetTemp);
        var response = {
          'body' : req.params.body,
          "newSetpoint" : targetTemp,
          "success" : true
        }
        res.json(response)
        console.log('Returned ' + req.method + ' ' + req.route.path);
      } else {
        console.log('Invalid Setpoint Temperature')
        var setPointError = {
          "code" : "418",
          "message" : 'Setpoint should be between '+ minTemp +' and ' + maxTemp
        }
        res.status(418).send(setPointError)
      }
    } else {
      res.status(418).send(bodyTypeError)
    }
  } else {
    res.status(503).send(error503Object)
}
});
app.put(baseApiPath + '/:body/heater/mode/:mode', function(req, res){
  // heatMode: 0: "Off", 1: "Solar", 2 : "Solar Preferred", 3 : "Heat Pump", 4: "Don't Change"
  console.log(req.params)
  if (poolSpaInfo.meta.successfulPolling){
    if(req.params.body == 'spa' || req.params.body == 'pool') {
      var targetBody = bodyMap[req.params.body]
      var targetHeatMode = parseInt(req.params.mode);
      if (targetHeatMode >= 0 && targetHeatMode <= 4){
        setHeatMode(targetBody, targetHeatMode)
        var response = {
          "targetBody" : req.params.body,
          "newHeaterMode" : targetHeatMode,
          "newHeaterModeMeaning" : heaterModes[targetHeatMode],
          "success" : true
        }
        res.json(response)
        console.log('Returned ' + req.method + ' ' + req.route.path);
      } else {
        var heatModeError = {
          "code" : "418",
          "message" : "Invalid Heat Mode",
          "Valid Heat Modes" : heaterModes
        }
        res.status(418).send(heatModeError)
      }
    } else {
      res.status(418).send(bodyTypeError)
    }
  } else {
    res.status(503).send(error503Object)
  }
});

app.get('/connection', function(req, res){
  findScreenLogic();
  var slConnection = getSlClient()
  res.json(slConnection)
  console.log('Returned ' + req.method + ' ' + req.route.path);
});
