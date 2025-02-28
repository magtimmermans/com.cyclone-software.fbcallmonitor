"use strict"
const net 			= require('net');
const Homey         = require('homey');

var host = 'fritz.box'; // ipaddress | 'fritz.box'
var port = 1012;
var lastData = null;
var socket = null;
var phoneBook = [];
var Call = false;




class FBApp extends Homey.App {
    /*
    #96*5* – Callmonitor inschakelen
    #96*4* – Callmonitor uitschakelen
    */
    onInit() {

        this.log(`${this.homey.manifest.id} V${this.homey.manifest.version} is running...`);

        this._flowTriggers = [];

        // const telnumCondition = this.homey.flow.getConditionCard('TelNumber');
        // const fbIncommingCallTrigger = this.homey.flow.getTriggerCard('fb_incomming_call');
        // const fbCallAnwseredTrigger = this.homey.flow.getTriggerCard('fb_call_anwsered');
        // const fbCallDisconnectedTrigger = this.homey.flow.getTriggerCard('fb_disconnect_call');
        // const fbOutgoingTrigger = this.homey.flow.getTriggerCard('fb_call');
        // const fbMissedCallTrigger = this.homey.flow.getTriggerCard('fb_missed_call');

        this.registerFlowCards();

        phoneBook = [];
        let phoneBookxml =  this.homey.settings.get('fritz_phonebook'); //Homey.manager('settings').get('fritz_phonebook');

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
                            this.log("Phonebook XML contains invalid data.");
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

        this.log("Load Settings");

        host = this.homey.settings.get('fritz_host');  //Homey.manager('settings').get('fritz_host');
        port = this.homey.settings.get('fritz_port');  //Homey.manager('settings').get('fritz_port');
        
        this.log("Init Socket");

        if (port) {
            socket = new net.Socket();
            socket.connect(port, host);

            socket.on('connect', this.handleConnect.bind(this));
            socket.on('data', this.handleData.bind(this));
            socket.on('error', this.handleError.bind(this));

            socket.on('close', function() {   // Try to reconnect after 30s
                setTimeout(function() { this.onInit(); }, 30000 );
                console.log('Connection Closed');
              });

            process.on('SIGINT', this.closeSocket);
            process.on('SIGTERM', this.closeSocket);
            process.on('SIGBREAK', this.closeSocket);


            this._cards.telnumCondition.registerRunListener(( args, state ) => {
                if (lastData) {
                    if (lastData.type != 'DISCONNECT') {
                        if (lastData.remoteNumber == args.telnr) {
                            return Promise.resolve( true );
                        }
                    }
                }
                return Promise.resolve( false );
            })
        
        
            // fbIncommingCallTrigger.register();
            // fbCallAnwseredTrigger.register();
            // fbCallDisconnectedTrigger.register();
            // fbOutgoingTrigger.register();

                //Get update settings
            this.homey.settings.on('set', (key) => {
                    console.log('Update Settings:');    
                    console.log(key);

                    // Don't reload when it is the fritzbox settings from the devices
                    // if(name.indexOf("fritzbox_settings_") > -1)
                    // {
                    //     return;
                    // }

                    closeSocket()
                    onInit();
            });

            this.homey.on('unload', function() {
                this.closeSocket();
            });

        }

      //  setInterval(this.simCall.bind(this), 60 * 1000); // for testing
    }

    // register homey flowcards 
    registerFlowCards() {
        let triggers = [
            'fb_incomming_call',
            'fb_call_anwsered',
            'fb_disconnect_call',
            'fb_call',
            'fb_missed_call'
        ];

        for (const trigger of triggers) {
            this._flowTriggers[trigger] = this.homey.flow.getTriggerCard(trigger);
        }

        //* register cards
        this._cards = {
            telnumCondition: this.homey.flow.getConditionCard('TelNumber'),
        }

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

       // console.log(line);

        switch (result.type) {
            case "CALL":
                Call=false; // Just to make sure
                result.line = chunks[3];
                result.localNumber = chunks[4];
                result.remoteNumber = chunks[5];
                
                this._flowTriggers['fb_call'].trigger({
                    fb_tel_nr: result.remoteNumber,
                    fb_abonnee_name: this.findNameInPB(result.remoteNumber),
                    fb_datetime: new Date().toLocaleString()
                }).catch(this.error);
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
                this._flowTriggers['fb_incomming_call'].trigger( tokens, state).catch(this.error);
                //console.log("trigger done");
                break;
            case "CONNECT":
                Call=false // taken the call
                result.line = chunks[3];
                result.remoteNumber = chunks[4];

                var tokens = { 'fb_tel_nr': result.remoteNumber, 'fb_abonnee_name': this.findNameInPB(result.remoteNumber), 'fb_datetime': new Date().toLocaleString() };
                var state = {};
                this._flowTriggers['fb_call_anwsered'].trigger( tokens, state).catch(this.error);
                break;
            case "DISCONNECT":
                if (Call) {
                    // missed call
                    this.log('missed call');
                    fbMissedCallTrigger.trigger({
                        fb_tel_nr: lastData.remoteNumber,
                        fb_abonnee_name: this.findNameInPB(lastData.remoteNumber),
                        fb_datetime: new Date().toLocaleString()
                    }).catch(this.error);
                    Call=false;
                }
                result.duration = chunks[3];
                this._flowTriggers['fb_disconnect_call'].trigger({'fb_duration': result.duration}, null).catch(this.error);
                break;
        }
        return result;
    }


    findNameInPB(number) {
        var unknown = this.homey.__('unknown');
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