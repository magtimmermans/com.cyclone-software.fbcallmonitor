'use strict';

const events	= require('events');
const _			= require('underscore');
const Fritz		= require('fritzapi').Fritz;

const pollInterval = 5000;

class Router extends events.EventEmitter {

	constructor( id, address ) {
		super();

		this.setMaxListeners(0);

		this._debug 	= true;

		// Get detailed device data (via UPNP??)
		this.id 			= id.toLowerCase();
		this.address 		= address;
		this.name 			= "fritz.box";
		this.modelId 		= "default";
		this.modelName 		= undefined;
		this.icon 			= `/app/${Homey.manifest.id}/assets/images/routers/${this.modelId}.svg`;

		this._sockets	= {};		
		this._client = new Fritz("", "", address);
	}

	/*
		Helper methods
	*/
	debug() {
		if( this._debug ) {
			this.log.apply( this, arguments );
		}
	}

	log() {
		if( Homey.app ) {
			Homey.app.log.bind( Homey.app, `[${this.constructor.name}][${this.id}]` ).apply( Homey.app, arguments );
		}
	}

	error() {
		if( Homey.app ) {
			Homey.app.error.bind( Homey.app, `[${this.constructor.name}][${this.id}]` ).apply( Homey.app, arguments );
		}
	}

	/*
		Public methods
	*/
	init( callback ) {
		this.debug('init');

		callback = callback || ( err => {
			if( err ) return this.error( err );
		})

		this._credentials = this._getUserCredentials();
		
		// Check if credentials are known
		if( !this._credentials )
			return callback( new Error('no_credentials') );
		
		this._client = new Fritz(this._credentials.username, this._credentials.password, this.address);

		// Check if credentials are valid
		if( !this.isAuthenticated )
			return callback( new Error('invalid_credentials') );

		// Set refresh interval
		if( this._refreshInterval ) clearInterval(this._refreshInterval);
		this._refreshInterval = setInterval( this._refreshDevices.bind(this), pollInterval);

		// Get router data
		this._testAuthentication(( err ) => {
			if( err ) return callback( err );

			this._refreshDevices(( err ) => {
				if( err ) return callback( err );

				this.log('fritzbox_available')
				this.emit('fritzbox_available');

				callback( null );
			});
		});
	}

	setAddress( address ) {
		this.address = address;

		if(typeof this._client === 'undefined')
		{
			return;
		}
		
		if(typeof this._client.options === 'undefined')
		{
			this._client.options = {};
		}
		
		this._client.options.url = address;
	}

	_getUserCredentials() {
		let credentials = undefined;
		
		Homey
			.manager('settings')
			.getKeys()
			.forEach(( key ) => {
				if( key.toLowerCase() === `fritzbox_settings_${this.id}`.toLowerCase() ) {
					credentials = Homey.manager('settings').get( key );
				}
			});

		return credentials;
	}

	isAuthenticated() {
		var SID = this._client.getSID();
		return !(typeof SID === 'undefined' || SID === null || SID === '0000000000000000');
	}

	register( username, password, callback ) {
		callback = callback || function(){}

		Homey.manager('settings')
			 .set(`fritzbox_settings_${this.id}`.toLowerCase(), { username: username, password: password });
		
		this.init(callback);
	}
	
	/*
		Generic device methods
	*/
	getDevice(ain)
	{
		return this._client.getDevice(ain);
	}

	/*
		Socket methods
	*/
	getSockets() {
		return this._sockets;
	}

	getSocket( socketId ) {
		let socket = _.findWhere( this._sockets, { uniqueId: socketId });
		if(typeof socket === 'undefined' || socket === null || socket.present !== true)
		{
			return  new Error('invalid_socket');
		}
		
		return socket;
	}

	saveSocket( socket ) {
		if(socket.onoff === false)
		{
			return this._client.setSwitchOff(socket.uniqueId);
		}
		else if(socket.onoff === true)
		{
			return this._client.setSwitchOn(socket.uniqueId);
		}
		
		return Promise.resolve(false);
	}

	/*
		Generic save
	*/
	save( type, instance ) {

		if( type === 'socket' )
			return this.saveSocket( instance );

		if( type === 'thermostat' )
			return this.saveThermostat( instance );

		return new Error('invalid_type');
	}

	/*
		Private methods
	*/
	_testAuthentication( callback ) {
		this.debug('_testAuthentication');

		callback = callback || function(){}
		
		this._client.isAuthenticated()
			.then(() => {
				callback();
			})
			.catch((err) => {
				Homey.manager('settings').unset( `fritzbox_settings_${this.id}` );
				callback( err );
			});
	}

	_refreshDevices( callback ) {
		this.debug('_refreshDevices');

		callback = callback || function(){}

		var getSockets = this._client.getSwitchList()
			.then((sockets) => {
				let deviceInfo = [];
				for (let socket in sockets)
				{
					this._client.getDevice(sockets[socket])
						.then((device) => {
							
							//this.debug("current state", device);
							
							var powerMeter = 0;
							try {
								powerMeter = parseInt(device.powermeter.energy) / 1000; // kWh
							} catch (e) { this.debug(e); }
							
							var temperature = 0;
							try {
								temperature = parseInt(device.temperature.celsius) / 10;
							} catch (e) { this.debug(e); }
							
							var powerMeasure = 0;
							try {
								powerMeasure = parseInt(device.powermeter.power) / 1000; // W
							} catch (e) { this.debug(e); }
							
							var onOff = false;
							try {
								onOff = device.switch.state === '1' ? true : false;
							} catch (e) { this.debug(e); }
							
							let uniqueId = device.identifier.replace(/\s+/g, '');
							
							// When device is offline
							let capableSocket = 
							{
								id: device.identifier,
								uniqueId: uniqueId,
								name: device.name,
								modelId: device.productname,
								manufacturer: device.manufacturer
							}
							
							if(device.present === '0')
							{
								// Remove device from list to report it unavailable
								capableSocket.present = false;
								this._sockets[uniqueId] = capableSocket;
								return;
							}
							
							capableSocket.present = true;
							capableSocket.onoff = onOff;
							capableSocket.measure_temperature = temperature; // Celcius
							capableSocket.meter_power = powerMeter; // kWh
							capableSocket.measure_power = powerMeasure; // W
							
							this._sockets[uniqueId] = capableSocket;
						});
				}
			})

		var getThermostats = this._client.getThermostatList()
			.then((thermostats) => {
				this._thermostats = thermostats;
			})

		Promise.all([ getSockets, getThermostats ])
			.then(( result ) => {
				this.emit('refresh');
				callback();
			})
			.catch( callback )
	}
}

module.exports = Router;