#!/usr/bin/env node
const ScreenLogic = require('node-screenlogic');

var finder = new ScreenLogic.FindUnits();
finder.on('serverFound', function(server) {
 finder.close();
 console.log(server.address + ':'+ server.port)
//  connect(new ScreenLogic.UnitConnection(server));
});

finder.search();

// function connect(client) {
//     client.on('loggedIn', function() {
//       this.getVersion();
//     }).on('version', function(version) {
//       this.getPoolStatus();
//       console.log(client);
//       client.close();
//     });

//     client.connect();
// }