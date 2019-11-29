#!/usr/bin/env node
'use strict';
const expressPort = 3000;
var express = require('express');
var app = express();
const ScreenLogic = require('node-screenlogic');
const pollInterval = 5000;

const clientInt = 0;

const commonCircuitIds = {
  'pool' : 505,
  'spa' : 500
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

var slIpAddress = null;
var slPort = null;
if (process.env.SL_IP_ADDRESS && process.env.SL_PORT){
  slIpAddress = process.env.SL_IP_ADDRESS;
  slPort = process.env.SL_PORT;
}

function findScreenLogic(){
  if (slIpAddress && slPort){
    // console.log(server)
    // console.log(connection);
    poolSpaInfo.meta.server = {
      "ipAddress" : slIpAddress,
      "port" : slPort,
      "name" : slIpAddress,
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

function resolveBody(bodyInt){
  var bodyText = new String
  if (bodyInt == 0){
    bodyText = 'pool'
  } else if (bodyInt == 1){
    bodyText = 'spa'
  } else {
    throw "Out of Range Exception: body value must be 0 (pool) or 1 (spa)."
  }
  return(bodyText)
}

function setHeatMode(body, heatMode){
  // Body: pool = 0; spa = 1
  // heatMode: 0: "Off", 1: "Solar", 2 : "Solar Preferred", 3 : "Heat Pump", 4: "Don't Change"
  var client = getSlClient();
  var heatBody = resolveBody(body)
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
  var heatBody = resolveBody(body);
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
          'pool' : {          
            'waterTemp' : status.currentTemp[0],
            'active' : status.isPoolActive(),
            'heaterModeCode' : status.heatMode[0],
            'heaterMode' : heaterModes[status.heatMode[0]],
            'heaterActive' : (status.heatStatus[0] > 0),
            'heaterActiveCode' : status.heatStatus[0],
            'heaterActiveType' : heaterStatus[status.heatStatus[0]],
            'heaterSetpoint' : status.setPoint[0],
            'airTemp' : status.airTemp,
          },
          'spa' : {
            'waterTemp' : status.currentTemp[1],
            'active' : status.isSpaActive(),
            'heaterModeCode' : status.heatMode[1],
            'heaterMode' : heaterModes[status.heatMode[1]],
            'heaterActive' : (status.heatStatus[1] > 0),
            'heaterActiveCode' : status.heatStatus[1],
            'heaterActiveType': heaterStatus[status.heatStatus[1]],
            'heaterSetpoint' : status.setPoint[1],
            'airTemp' : status.airTemp,
          },
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
          'meta'  : 'This data only valid if IntelliChem in installed',
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
        'pumps' : config.pumpCircArray,
        'circuits' : config.bodyArray,
        'controllerId' : config.controllerId,
        'poolMinSetPoint' : config.minSetPoint[0],
        'poolMaxSetPoint' : config.maxSetPoint[0],
        'spaMinSetPoint' : config.minSetPoint[1],
        'spaMaxSetPoint' : config.maxSetPoint[1],
        'interfaceTabFlags' : config.interfaceTabFlags
      };
      rawObjects.config = config
      poolSpaInfo.meta.successfulPolling = true
      poolSpaInfo.meta.lastUpdated = Date.now();
      rawObjects.meta.lastUpdated = Date.now();
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

function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis));
}



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
  sleep(5000);
  console.log('Pool data update interval is ' + pollInterval + 'ms.')
  setInterval(function() {
    getAllpoolSpaInfo();
  }, pollInterval);
  if(!poolSpaInfo.meta.successfulPolling){
    sleep(5000)
  };
  console.log("Express server listening on port " + expressPort)
});

function checkGlobals(){
  if (poolSpaInfo.meta.successfulPolling){
    return true
  } else {
    return false
  }

}

app.get('/', function(req, res){
    var response = slash();
    res.json(response);
});

function slash(){
    var message = {"done" : "yes"};
    return message;
};


app.get('/api/v1/all', function(req, res){
  console.log(req.ip);
  // console.log('All Pool Info: ' + poolSpaInfo);
  res.json(poolSpaInfo);
});
app.get('/api/v1/raw', function(req, res){
  console.log(req.ip);
  // console.log('All Pool Info: ' + poolSpaInfo);
  res.json(rawObjects);
});

app.put('/api/v1/pool/on', function(req,res){
  console.log(req.ip);
  setPoolModeOn();
  var response = {
    'action' : 'poolOn',
    'sent' : 'true'
  }
  console.log('Sent poolOn to ScreenLogic')
  res.json(response)
})

app.put('/api/v1/pool/off', function(req,res){
  console.log(req.ip);
  setPoolModeOff();
  var response = {
    'action' : 'poolOff',
    'sent' : true
  }
  console.log('Sent poolOff to ScreenLogic')
  res.json(response)
});

app.put('/api/v1/spa/on', function(req,res){
  console.log(req.ip);
  setSpaModeOn();
  var response = {
    'action' : 'spaOn',
    'sent' : 'true'
  }
  console.log('Sent poolOn to ScreenLogic')
  res.json(response)
})

app.put('/api/v1/spa/off', function(req,res){
  console.log(req.ip);
  setSpaModeOff();
  var response = {
    'action' : 'spaOff',
    'sent' : true
  }
  console.log('Sent poolOff to ScreenLogic')
  res.json(response)
});

app.put('/api/v1/:circuit/:state', function(req,res){
  console.log(req.ip);
  console.log(req.params);
  var changeCircuit = parseInt(req.params.circuit);
  var stateInt = null;
  if (!req.params.circuit || !req.params.state){
    res.status(406).send('{"Error" : "The format of this request is /api/v1/circuit/state. Circuit should be the number of the circuit. State should be 0 (off) or 1 (on)."}');
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
  res.status(200).send( '{"Circuit" : '+changeCircuit+', \n "NewState" : '+stateInt+'}')
});

app.put('/api/v1/spa/heater/setpoint/:temp', function(req, res){
  console.log(req.params)
  if (poolSpaInfo.meta.successfulPolling){
    var targetTemp = parseInt(req.params.temp);
    var maxTemp = parseInt(poolSpaInfo.controllerConfig.spaMaxSetPoint);
    var minTemp = parseInt(poolSpaInfo.controllerConfig.spaMinSetPoint);
    // console.log(targetTemp)
    if (minTemp <= targetTemp && maxTemp >= targetTemp){
      console.log('Valid Setpoint Temperature')
      setHeatSetPoint(1, targetTemp);
      var response = {
        "spaSetpoint" : targetTemp,
        "success" : true
      }
      res.json(response)
    } else {
      console.log('Invalid Setpoint Temperature')
      var setPointError = {
        "code" : "418",
        "message" : 'Setpoint should be between '+ minTemp +' and ' + maxTemp
      }
      res.status(418).send(setPointError)
    }
  } else {
    res.status(503).send(error503Object)
}
});
app.put('/api/v1/spa/heater/mode/:mode', function(req, res){
  // heatMode: 0: "Off", 1: "Solar", 2 : "Solar Preferred", 3 : "Heat Pump", 4: "Don't Change"
  console.log(req.params)
  if (poolSpaInfo.meta.successfulPolling){
    var targetHeatMode = parseInt(req.params.mode);
    if (targetHeatMode >= 0 && targetHeatMode <= 4){
      setHeatMode(1, targetHeatMode)
      var response = {
        "spaHeaterMode" : targetHeatMode,
        "HeaterModeMeaning" : heaterModes[targetHeatMode],
        "success" : true
      }
      res.json(response)
    } else {
      var heatModeError = {
        "code" : "418",
        "message" : "Invalid Heat Mode",
        "Valid Heat Modes" : heaterModes
      }
      res.status(418).send(heatModeError)
    }
  } else {
    res.status(503).send(error503Object)
  }
});

app.put('/api/v1/pool/heater/setpoint/:temp', function(req, res){
  console.log(req.params)
  if (poolSpaInfo.meta.successfulPolling){
    var targetTemp = parseInt(req.params.temp);
    var maxTemp = parseInt(poolSpaInfo.controllerConfig.poolMaxSetPoint);
    var minTemp = parseInt(poolSpaInfo.controllerConfig.poolMinSetPoint);
    // console.log(targetTemp)
    if (minTemp <= targetTemp && maxTemp >= targetTemp){
      console.log('Valid Setpoint Temperature')
      setHeatSetPoint(0, targetTemp);
      var response = {
        "poolSetpoint" : targetTemp,
        "success" : true
      }
      res.json(response)
    } else {
      console.log('Invalid Setpoint Temperature')
      res.status(418).send('Error: Setpoint should be between '+ minTemp +' and ' + maxTemp + '.\n')
    }
  } else {
    res.status(503).send(error503Object)
}
});
app.put('/api/v1/pool/heater/mode/:mode', function(req, res){
  // heatMode: 0: "Off", 1: "Solar", 2 : "Solar Preferred", 3 : "Heat Pump", 4: "Don't Change"
  console.log(req.params)
  if (poolSpaInfo.meta.successfulPolling){
    var targetHeatMode = parseInt(req.params.mode);
    if (targetHeatMode >= 0 && targetHeatMode <= 4){
      setHeatMode(0, targetHeatMode)
      var response = {
        "poolHeaterMode" : targetHeatMode,
        "HeaterModeMeaning" : heaterModes[targetHeatMode],
        "success" : true
      }
      res.json(response)
    } else {
      var heatModeError = {
        "code" : "418",
        "message" : "Invalid Heat Mode",
        "Valid Heat Modes" : heaterModes
      }
      res.status(418).send(heatModeError)
    }
  } else {
    res.status(503).send(error503Object)
  }
});

app.get('/connection', function(req, res){
  findScreenLogic();
  var slConnection = getSlClient()
  res.json(slConnection)
});
