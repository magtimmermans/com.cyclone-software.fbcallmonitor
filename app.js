"use strict";

const net = require('net');

var host = 'fritz.box'; // ipaddress | 'fritz.box'
var port = 1012;
var lastData = null;
var socket = null;
var phoneBookxml = '';
var phoneBook = [];

/*
  #96*5* – Callmonitor inschakelen
  #96*4* – Callmonitor uitschakelen
*/

function init() {

    Homey.log("Load Settings");

    host = Homey.manager('settings').get('fritz_host');
    port = Homey.manager('settings').get('fritz_port');

    Homey.log("Load phonebook");


    phoneBook = [];
    phoneBookxml = Homey.manager('settings').get('fritz_phonebook');

    if (phoneBookxml) {
        var parseString = require('xml2js').parseString;
        parseString(phoneBookxml, function(err, result) {
            if (!err) {
                result.phonebooks.phonebook[0].contact.forEach(function(item) {
                    //  console.log(item.person[0].realName[0]);
                    item.telephony[0].number.forEach(function(data) {
                        var number = data._;
                        if (!isNaN(number)) {
                            //console.log('add number:'+ number);
                            phoneBook[number] = item.person[0].realName[0];
                        }
                    })
                })
            }
        });
    }

    Homey.log("Init Socket");

    socket = new net.Socket();
    socket.connect(port, host);

    socket.on('connect', handleConnect);
    socket.on('data', handleData);
    socket.on('error', handleError);

    process.on('SIGINT', closeSocket);
    process.on('SIGTERM', closeSocket);
    process.on('SIGBREAK', closeSocket);

    //    setInterval(simCall, 20 * 1000); // for testing

}


// function simCall() {
//     parseCallMonitorLine('22.09.16 19:03:31;RING;0;026123456;026123456;SIP2;');
//     parseCallMonitorLine('22.09.16 12:45:47;CONNECT;0;12;0263561234;');
//     parseCallMonitorLine('22.09.16 12:46:01;DISCONNECT;0;11;');
// }

function parseCallMonitorLine(line) {
    var chunks = line.split(';');
    var result = {}; // for later use to add actions

    result.date = chunks[0];
    result.type = chunks[1];
    result.connectionId = chunks[2];

    switch (result.type) {
        case "CALL":
            result.line = chunks[3];
            result.localNumber = chunks[4];
            result.remoteNumber = chunks[5];
            break;
        case "RING":
            result.remoteNumber = chunks[3];
            result.localNumber = chunks[4];
            console.log(findNameInPB(result.remoteNumber));
            Homey.manager('flow').trigger('fb_incomming_call', {
                fb_tel_nr: result.remoteNumber,
                fb_abonnee_name: findNameInPB(result.remoteNumber)
            });
            break;
        case "CONNECT":
            result.line = chunks[3];
            result.remoteNumber = chunks[4];
            Homey.manager('flow').trigger('fb_call_anwsered', {
                fb_tel_nr: result.remoteNumber,
                fb_abonnee_name: findNameInPB(result.remoteNumber)
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


Homey.manager('flow').on('condition.TelNumber', function(callback, args) {
    if (lastData) {
        if (lastData.type != 'DISCONNECT') {
            if (lastData.remoteNumber == args.telnr) {
                callback(null, true);
            }
        }
    }
    callback(null, false);
});

Homey.manager('flow').on('trigger.fb_incomming_call', function(callback, args) {
    Homey.log('trigger fired');
    callback(null, true); // true to make the flow continue, or false to abort
});


Homey.manager('settings').on('set', function(name) {
    Homey.log('variable ' + name + ' has been set');
    closeSocket()
    init();
});



function findNameInPB(number) {
    var unknown = __('unknown');
    if (phoneBook) {
        if (number in phoneBook) {
            return phoneBook[number];
        } else
            return unknown;
    } else
        return unknown;
}


function handleConnect() {
    Homey.log('fritz connected to ' + host);
}

function handleData(data) {
    var line = data.toString();
    lastData = parseCallMonitorLine(line);
    Homey.log(line);
}

function handleError(err) {
    // catch some errors
    Homey.error('Could not connect to ' + host);
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
        socket = null;
    }
}

Homey.on('unload', function() {
    closeSocket();
});

module.exports.init = init;