#!/usr/bin/env node
const ScreenLogic = require('node-screenlogic');
var yaml = require('js-yaml')
const configMap = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: "screenlogic-info"
    },
    data: {
        SL_IP_ADDRESS : "",
        SL_PORT: 80
    }
  }

var finder = new ScreenLogic.FindUnits();
finder.on('serverFound', function(server) {
 configMap.data.SL_IP_ADDRESS = server.address
 configMap.data.SL_PORT = server.port
 finder.close();
 console.log(
    yaml.dump(configMap)
 )
//  console.log(server.address + ':'+ server.port)
//  connect(new ScreenLogic.UnitConnection(server));
});

finder.search();

