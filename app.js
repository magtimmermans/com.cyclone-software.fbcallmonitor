"use strict"
const net 			= require('net');
const events		= require('events');

const Log 			= require('homey-log').Log;
const fritz 		= require('fritzapi').Fritz;
const Router		= require('./lib/router.js');

const findFritzboxesInterval 	= 600000;

var host = 'fritz.box'; // ipaddress | 'fritz.box'
var port = 1012;
var lastData = null;
var socket = null;
var phoneBook = [];

/*
  #96*5* – Callmonitor inschakelen
  #96*4* – Callmonitor uitschakelen
*/
function initCallMonitor() {

    Homey.log("Load Phonebook");

    phoneBook = [];
    let phoneBookxml = Homey.manager('settings').get('fritz_phonebook');

    if (phoneBookxml) {
        var parseString = require('xml2js').parseString;
        parseString(phoneBookxml,
		function(err, result) {
            if (!err) {
				if(typeof result.phonebooks === 'undefined' || 
					typeof result.phonebooks.phonebook[0] === 'undefined' ||
					typeof result.phonebooks.phonebook[0].contact === 'undefined')
					{
						// Skip invalid phonebooks and log message, prevent app from crashing.
						Homey.log("Phonebook XML contains invalid data.");
						return false;
					}
				
                result.phonebooks.phonebook[0].contact.forEach(function(item) {
					if(typeof item.telephony[0] === 'undefined' ||
						typeof item.telephony[0].number === 'undefined' ||
						typeof item.person[0] === 'undefined' ||
						typeof item.person[0].realName[0] === 'undefined')
						{
							// Skip invalid items.
							return;
						}
					
                    item.telephony[0].number.forEach(function(data) {
                        var number = data._;
                        if (!isNaN(number))
						{
                            phoneBook[number] = item.person[0].realName[0];
                        }
                    })
                })
            }
        });
    }

    Homey.log("Load Settings");

    host = Homey.manager('settings').get('fritz_host');
    port = Homey.manager('settings').get('fritz_port');
	
    Homey.log("Init Socket");

    if (port) {
        socket = new net.Socket();
        socket.connect(port, host);

        socket.on('connect', handleConnect);
        socket.on('data', handleData);
        socket.on('error', handleError);

        process.on('SIGINT', closeSocket);
        process.on('SIGTERM', closeSocket);
        process.on('SIGBREAK', closeSocket);
    }

    //    setInterval(simCall, 20 * 1000); // for testing
}


function simCall() {
    //  parseCallMonitorLine('22.09.16 19:03:31;RING;0;0263561234;0263561234;SIP2;');
    // parseCallMonitorLine('22.09.16 12:45:47;CONNECT;0;12;0263561234;');
    // parseCallMonitorLine('22.09.16 12:46:01;DISCONNECT;0;11;');
    //  parseCallMonitorLine('15.01.17 12:22:31;CALL;1;12;0263233889;0263561234;SIP2;')
}

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
            Homey.manager('flow').trigger('fb_call', {
                fb_tel_nr: result.remoteNumber,
                fb_abonnee_name: findNameInPB(result.remoteNumber),
                fb_datetime: new Date().toLocaleString()
            });
            break;
        case "RING":
            result.remoteNumber = chunks[3];
            result.localNumber = chunks[4];
            console.log(findNameInPB(result.remoteNumber));
            Homey.manager('flow').trigger('fb_incomming_call', {
                fb_tel_nr: result.remoteNumber,
                fb_abonnee_name: findNameInPB(result.remoteNumber),
                fb_datetime: new Date().toLocaleString()
            });
            break;
        case "CONNECT":
            result.line = chunks[3];
            result.remoteNumber = chunks[4];
            Homey.manager('flow').trigger('fb_call_anwsered', {
                fb_tel_nr: result.remoteNumber,
                fb_abonnee_name: findNameInPB(result.remoteNumber),
                fb_datetime: new Date().toLocaleString()
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
    Homey.log('Trigger fired');
    callback(null, true); // true to make the flow continue, or false to abort
});

Homey.manager('settings').on('set', function(name) {
    Homey.log('Variable ' + name + ' has been set');
	
	// Don't reload when it is the fritzbox settings from the devices
	if(name.indexOf("fritzbox_settings_") > -1)
	{
		return;
	}
	
    closeSocket()
    initCallMonitor();
});

function findNameInPB(number) {
    var unknown = __('unknown');
    if (phoneBook)
	{
        if (number in phoneBook)
		{
            return phoneBook[number];
        }
		else
		{
            return unknown;
		}
    }
	else
	{
        return unknown;
	}
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
    // Catch some errors
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

//module.exports.init = init;


/******
***
*** To handle FRITZBOX smart home functionalities
***
*******/
class App extends events.EventEmitter {

	constructor() {
		super();

		this.setMaxListeners(0);
		this._fritzboxes = {};
		this.init = this._onExportsInit.bind(this);
	}

	/*
		Helper methods
	*/
	log() {
		console.log.bind(this, '[log]' ).apply( this, arguments );
	}

	error() {
		console.error.bind( this, '[error]' ).apply( this, arguments );
	}

	/*
		Fritzbox methods
	*/
	findFritzboxes() {		
		// Get IP settings from app settings page.
		// I don't know how to do a proper discovery function otherwise that would be nice
		// Then you can add multiple FritzBoxes
		let host = Homey.manager('settings').get('fritz_host');
		
		if(typeof host === 'undefined' || host === null || host === '')
		{
			return;
		}
		
		let fritzbox = {
			id: "abc-123",
			ip: "http://" + host
		};
		
		this._initFritzbox(fritzbox);
	}

	_initFritzbox( fritzbox ) {
		console.log("_initFritzbox");
		
		fritzbox.id = fritzbox.id.toLowerCase();

		// skip if already found but update ip if changed
		if( this._fritzboxes[ fritzbox.id ] instanceof Router ) {

			if( this._fritzboxes[ fritzbox.id ].address !== fritzbox.ip ) {
				this.log(`Fritzbox ip has changed from ${this._fritzboxes[ fritzbox.id ].address} to ${fritzbox.ip}`);
				this._fritzboxes[ fritzbox.id ].setAddress( fritzbox.ip );
			}

			return;
		}

		console.log("Found fritzbox");
		this.log(`Found fritzbox ${fritzbox.id} @ ${fritzbox.ip}`);

		this._fritzboxes[ fritzbox.id ] = new Router( fritzbox.id, fritzbox.ip );
		this._fritzboxes[ fritzbox.id ]
			.on('log', this.log.bind( this, `[${fritzbox.id}]`) )
			.on('error', this.error.bind( this, `[${fritzbox.id}]`) )
			.on('fritzbox_available', () => {
				this.emit('fritzbox_available', this._fritzboxes[ fritzbox.id ] );
			})
			.init()
	}

	getFritzboxes() {
		return this._fritzboxes;
	}

	getFritzbox( fritzboxId ) {
		if( typeof fritzboxId !== 'string' ) return new Error('invalid_fritzbox');
		return this._fritzboxes[ fritzboxId.toLowerCase() ] || new Error('invalid_fritzbox');
	}

	/*
		Export methods
	*/
	_onExportsInit() {
		console.log(`${Homey.manifest.id} running...`);
		this.findFritzboxes();
		setInterval( this.findFritzboxes.bind(this), findFritzboxesInterval );
		initCallMonitor();
	}
}

module.exports = new App();