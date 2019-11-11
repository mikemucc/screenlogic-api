
'use strict';
const expressPort = 3000
var express = require('express');
var app = express();
const ScreenLogic = require('node-screenlogic');
const pollInterval = 5000

const commonCircuitIds = {
  'pool' : 505,
  'spa' : 500
}

const poolSpaInfo = {
  'meta' : 
    {
      'lastUpdated' : Date.now(),
      'tempInCelcius' : false
    }
};

const rawObjects = {
  'meta' : 
  {
    'lastUpdated' : Date.now()
  }
};
const rawPumpStatus = {}


function initScreenLogic(circuitId = null, newState = null){
  // var connection = {}

  var finder = new ScreenLogic.FindUnits();
  finder.search();
  finder.on('serverFound', function(server) 
      {
      var connection = new ScreenLogic.UnitConnection(server)
      // console.log(server)
      // console.log(connection);
      poolSpaInfo.meta.server = {
        "ipAddress" : server.address,
        "port" : server.port,
        "name" : server.gatewayName
      }
      finder.close();
      if (circuitId && (newState != null)){
        console.log('Calling setNewCircuitState')
        setNewCircuitState(connection, circuitId, newState);
      } else {
        console.log('Polling Screenlogic...');
        getAllpoolSpaInfo(connection);
      }
  }
  );
};

function setNewCircuitState(client, circuitId, state){
  console.log('Invoking change state with state = ' + state +' and circuit ID = ' + circuitId)
  client.on('loggedIn', function(){
        console.log('Logged in, sending state ' + state +' to circuit ID ' + circuitId)
        this.setCircuitState(0, circuitId, state);
      }).on('circuitStateChanged', function() {
        var newState = (state == 0 ) ? 'off' : 'on';
        console.log(`Circuit ${circuitId} set to ${newState}.`);
        client.close();
      });
      client.connect()
};

function getAllpoolSpaInfo(client){
  client.on('loggedIn', function() {
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
      var heaterModes = {
        "0" : "Off",
        "1" : "Solar",
        "2" : "Solar Preferred",
        "3" : "Heat Pump"
      }
      var heaterStatus = {
        "0" : 'Off',
        "1" : 'Solar Heater On',
        "2" : "Heat Pump On"
      }
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
      client.close();
    }).on('loginFailed', function() {
      console.log(' unable to login (wrong password?)');
      client.close();
    });
    client.connect();
    poolSpaInfo.meta.lastUpdated = Date.now();
    rawObjects.meta.lastUpdated = Date.now();
};

function setPoolModeOn() {
  initScreenLogic(505, 1)
};

function setPoolModeOff() {
  initScreenLogic(505, 0)
};

function setSpaModeOn() {
  initScreenLogic(500, 1)
};

function setSpaModeOff() {
  initScreenLogic(500, 0)
};


// Express.js endpoint logic below this line
// --------------------------------
var server = app.listen(expressPort, function(){
  console.log('Getting initial info from Screenlogic...')
  initScreenLogic('getInfo');
  console.log('Scheduling periodic updates of pool data...')
  setInterval(function() {
    initScreenLogic('getInfo');
  }, pollInterval);
  console.log("Express server listening on port " + expressPort)
  
});

app.get('/', function(req,res){
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
  if (req.params.circuit < 500 || req.params.circuit > 600){
    res.status(418).send('{"Error" : "Circuit should be an integer between 500 and 600"}');
    return
  }
  initScreenLogic(changeCircuit, stateInt)
  res.status(200).send( '{"Circuit" : '+changeCircuit+', \n "NewState" : '+stateInt+'}')
});

app.put('/api/v1/spa/heater/setPoint/:temp', function(req, res){
  console.log(req.params)
  res.json(req.params)
  
});
app.put('/api/v1/spa/heater/:onOff', function(req, res){
  console.log(req.params)
  res.json(req.params)
  
});
