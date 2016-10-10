"use strict";

const net = require('net');

var host = 'fritz.box'; // ipaddress | 'fritz.box'
var port = 1012;
var lastData = null;
var socket = null;

/*
  #96*5* – Callmonitor inschakelen
  #96*4* – Callmonitor uitschakelen
*/

function init() {
	
	Homey.log("Init Socket");

  host = Homey.manager('settings').get('fritz_host');
	port = Homey.manager('settings').get('fritz_port');
	
  socket = new net.Socket();
	socket.connect(port,host);
	
	socket.on('connect', handleConnect);
	socket.on('data', handleData);
	socket.on('error', handleError);
	
	process.on('SIGINT', closeSocket);
	process.on('SIGTERM', closeSocket);
	process.on('SIGBREAK', closeSocket);
	
	//setInterval(simCall, 20 * 1000); // for testing

    Homey.manager('flow').on('condition.TelNumber', function( callback, args ){
      if (lastData) {
        if (lastData.type!='DISCONNECT') {
            if (lastData.remoteNumber==args.telnr) {
                callback( null, true );
            }
        }
      }
      callback( null, false );
    }); 
	
}

Homey.manager('settings').on('set', function (name) {

//	Homey.log('variable ' + name + ' has been set');
	init();
	
});


// function simCall() {
//   parseCallMonitorLine('22.09.16 19:03:31;RING;0;0263561234;026123456;SIP2;');	
//   parseCallMonitorLine('22.09.16 12:45:47;CONNECT;0;12;0263561234;');	
//   parseCallMonitorLine('22.09.16 12:46:01;DISCONNECT;0;11;');  
// }

function parseCallMonitorLine(line) {
  var chunks = line.split(';');
  var result = {}; // for later use to add actions
  
  result.date = chunks[0];
  result.type = chunks[1];
  result.connectionId = chunks[2];

  switch(result.type) {
    case "CALL":
      result.line = chunks[3];
      result.localNumber = chunks[4];
      result.remoteNumber = chunks[5];
      break;
    case "RING":
       result.remoteNumber = chunks[3];
       result.localNumber = chunks[4];
        Homey.manager('flow').trigger('fb_incomming_call', {
          fb_tel_nr: result.remoteNumber,
        }); 
       break;
    case "CONNECT":
      result.line = chunks[3];
      result.remoteNumber = chunks[4];
      Homey.manager('flow').trigger('fb_call_anwsered', {
        fb_tel_nr: result.remoteNumber,
      }); 
      break;
    case "DISCONNECT":
      result.duration = chunks[3];
      Homey.manager('flow').trigger('fb_disconnect_call', {
        fb_duration: result.duration,
      }); 	  
      break;
  }
  return result;
}

Homey.manager('flow').on('trigger.fb_incomming_call', function( callback, args){
	Homey.log('trigger fired');
    callback( null, true ); // true to make the flow continue, or false to abort
});




function handleConnect() {
  Homey.log('fritz connected to ' + host);
}

function handleData(data) {
  var line = data.toString();
  lastData=parseCallMonitorLine(line);
  Homey.log(line);
}

function handleError(err) {
  // catch some errors
  Homey.error('Could not connect to ' +  host);
  if (err.code === 'ECONNREFUSED') {
     Homey.error('Is the CallMonitor enabled?');
  } else if (err.code === 'ENOTFOUND') {
     Homey.error('Host ' + host + ' not found.');
  } else if (err.code === 'EHOSTUNREACH') {
     Homey.error('Host ' + host + ' not found.');
  } else {
     Homey.error(err.code);
  }
}

function closeSocket() {
   if (socket) {
      socket.end();
      socket=null;
   }
}

 Homey.on('unload', function(){
    closeSocket();
 });

module.exports.init = init;