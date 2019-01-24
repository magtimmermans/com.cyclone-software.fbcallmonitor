"use strict"
const net 			= require('net');
const Homey         = require('homey');

var host = 'fritz.box'; // ipaddress | 'fritz.box'
var port = 1012;
var lastData = null;
var socket = null;
var phoneBook = [];
var Call = false;


const telnumCondition = new Homey.FlowCardCondition('TelNumber');
const fbIncommingCallTrigger = new Homey.FlowCardTrigger('fb_incomming_call');
const fbCallAnwseredTrigger = new Homey.FlowCardTrigger('fb_call_anwsered');
const fbCallDisconnectedTrigger = new Homey.FlowCardTrigger('fb_disconnect_call');
const fbOutgoingTrigger = new Homey.FlowCardTrigger('fb_call');
const fbMissedCallTrigger = new Homey.FlowCardTrigger('fb_missed_call');


class FBApp extends Homey.App {
    /*
    #96*5* – Callmonitor inschakelen
    #96*4* – Callmonitor uitschakelen
    */
    onInit() {

        console.log("Load Phonebook");

        phoneBook = [];
        let phoneBookxml =  Homey.ManagerSettings.get('fritz_phonebook'); //Homey.manager('settings').get('fritz_phonebook');

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
                            console.log("Phonebook XML contains invalid data.");
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

        console.log("Load Settings");

        host = Homey.ManagerSettings.get('fritz_host');  //Homey.manager('settings').get('fritz_host');
        port = Homey.ManagerSettings.get('fritz_port');  //Homey.manager('settings').get('fritz_port');
        
        console.log("Init Socket");

        if (port) {
            socket = new net.Socket();
            socket.connect(port, host);

            socket.on('connect', this.handleConnect.bind(this));
            socket.on('data', this.handleData.bind(this));
            socket.on('error', this.handleError.bind(this));

            process.on('SIGINT', this.closeSocket);
            process.on('SIGTERM', this.closeSocket);
            process.on('SIGBREAK', this.closeSocket);

            fbMissedCallTrigger.register();

            telnumCondition
            .register()
            .registerRunListener(( args, state ) => {
                if (lastData) {
                    if (lastData.type != 'DISCONNECT') {
                        if (lastData.remoteNumber == args.telnr) {
                            return Promise.resolve( true );
                        }
                    }
                }
                return Promise.resolve( false );
            })
        
        
            fbIncommingCallTrigger.register();
            fbCallAnwseredTrigger.register();
            fbCallDisconnectedTrigger.register();
            fbOutgoingTrigger.register();

                //Get update settings
            Homey.ManagerSettings.on('set', (key) => {
                    console.log('Update Settings:');    
                    console.log(key);

                    // Don't reload when it is the fritzbox settings from the devices
                    if(name.indexOf("fritzbox_settings_") > -1)
                    {
                        return;
                    }

                    closeSocket()
                    onInit();
            });

            Homey.on('unload', function() {
                this.closeSocket();
            });

        }

       // setInterval(this.simCall.bind(this), 60 * 1000); // for testing
    }


    // simCall() {
    //      this.parseCallMonitorLine('22.09.16 19:03:31;RING;0;0263561234;0263561234;SIP2;');
    //      this.parseCallMonitorLine('22.09.16 12:45:47;CONNECT;0;12;0263561234;');
    //      this.parseCallMonitorLine('22.09.16 12:46:01;DISCONNECT;0;11;');
    //      this.parseCallMonitorLine('15.01.17 12:22:31;CALL;1;12;026312119;0263561234;SIP2;')
    // }

    parseCallMonitorLine(line) {
        var chunks = line.split(';');
        var result = {}; // for later use to add actions

        result.date = chunks[0];
        result.type = chunks[1];
        result.connectionId = chunks[2];

        switch (result.type) {
            case "CALL":
                Call=false; // Just to make sure
                result.line = chunks[3];
                result.localNumber = chunks[4];
                result.remoteNumber = chunks[5];
                
                fbOutgoingTrigger.trigger({
                    fb_tel_nr: result.remoteNumber,
                    fb_abonnee_name: this.findNameInPB(result.remoteNumber),
                    fb_datetime: new Date().toLocaleString()
                }).catch(this.error).then(this.log);
                break;
            case "RING":
                Call=true // Incomming call
                result.remoteNumber = chunks[3];
                result.localNumber = chunks[4];
                console.log(this.findNameInPB(result.remoteNumber));
                var tokens = { 'fb_tel_nr': result.remoteNumber, 'fb_abonnee_name': this.findNameInPB(result.remoteNumber), 'fb_datetime': new Date().toLocaleString() };
                var state = {};
                console.log(tokens);
                console.log(state);
                fbIncommingCallTrigger.trigger( tokens, state).catch(this.error).then(this.log);
                console.log("trigger done");
                break;
            case "CONNECT":
                Call=false // taken the call
                result.line = chunks[3];
                result.remoteNumber = chunks[4];

                var tokens = { 'fb_tel_nr': result.remoteNumber, 'fb_abonnee_name': this.findNameInPB(result.remoteNumber), 'fb_datetime': new Date().toLocaleString() };
                var state = {};
                fbCallAnwseredTrigger.trigger( tokens, state).catch(this.error).then(this.log);
                break;
            case "DISCONNECT":
                if (Call) {
                    // missed call
                    fbMissedCallTrigger.trigger({
                        fb_tel_nr: lastData.remoteNumber,
                        fb_abonnee_name: this.findNameInPB(lastData.remoteNumber),
                        fb_datetime: new Date().toLocaleString()
                    }).catch(this.error).then(this.log);
                }
                Call=false;
                result.duration = chunks[3];
                fbCallDisconnectedTrigger.trigger({'fb_duration': result.duration}, null).catch(this.error).then(this.log);
                break;
        }
        return result;
    }


    findNameInPB(number) {
        var unknown = Homey.__('unknown');
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

    handleConnect() {
        this.log('fritz connected to ' + host);
    }

    handleData(data) {
        var line = data.toString();
        lastData = this.parseCallMonitorLine(line);
        this.log(line);
    }

    handleError(err) {
        // Catch some errors
        this.error('Could not connect to ' + host);
        if (err.code === 'ECONNREFUSED') {
            this.error('Is the CallMonitor enabled?');
        } else if (err.code === 'ENOTFOUND') {
            this.error('Host ' + host + ' not found.');
        } else if (err.code === 'EHOSTUNREACH') {
            this.error('Host ' + host + ' not found.');
        } else {
            this.error(err.code);
        }
    }

    closeSocket() {
        if (socket) {
            socket.end();
            socket.destroy();
            socket = null;
        }
    }

}

//module.exports.init = init;


module.exports = FBApp;