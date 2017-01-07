'use strict';

const Driver	= require('../../lib/driver.js');
const Router	= require('../../lib/router.js');

const defaultIcon 			= 'FD200';
const iconsMap				= {
	'FRITZ!DECT 200': 'FD200',
	'FRITZ!DECT 210': 'FD210'
}

class DriverSocket extends Driver {

	constructor() {
		super();

		this._deviceType = 'socket';

		this.capabilities = {};

		this.capabilities.onoff = {};
		this.capabilities.onoff.get = this._onExportsCapabilitiesOnoffGet.bind(this);
		this.capabilities.onoff.set = this._onExportsCapabilitiesOnoffSet.bind(this);
		
		this.capabilities.measure_power = {};
		this.capabilities.measure_power.get = this._onExportsCapabilitiesMeasurePowerGet.bind(this);
		
		this.capabilities.measure_temperature = {};
		this.capabilities.measure_temperature.get = this._onExportsCapabilitiesMeasureTemperatureGet.bind(this);
		
		this.capabilities.meter_power = {};
		this.capabilities.meter_power.get = this._onExportsCapabilitiesMeterPowerGet.bind(this);
	}

	_syncDevice( device_data ) {
		this.debug('_syncDevice', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error )
			return module.exports.setUnavailable( device_data, __('unreachable') );
		
		let deviceInstance = this.getDeviceInstance( device_data );
		if( deviceInstance instanceof Error )
			return module.exports.setUnavailable( device_data, __('unreachable') );
		
		module.exports.setAvailable( device_data );

		// Sync values to internal state
		for( let capabilityId in device.state )
		{
			let value = deviceInstance[ capabilityId ];
			if( typeof value !== 'undefined' ) {
				device.state[ capabilityId ] = value;
				module.exports.realtime( device_data, capabilityId, device.state[ capabilityId ] );
			}
		}
	}

	_onBeforeSave( device_data ) {

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return this.error( device );

		let deviceInstance = this.getDeviceInstance( device_data );
		if( deviceInstance instanceof Error ) return this.error( deviceInstance );

		for( let capabilityId in device.state )
		{
			// skip null values
			let value = device.state[ capabilityId ];
			if( value === null ) continue;

			deviceInstance[ capabilityId ] = value;
		}

		//deviceInstance['transitionTime'] = defaultTransitionTime;
	}

	_onExportsPairListDevices( state, data, callback ) {

		if( !state.fritzbox )
			return callback( 'invalid_fritz' );

		if( state.fritzbox instanceof Error )
			return callback( state.fritzbox );
		
		let result = [];
		
		for( let socket in state.fritzbox._sockets )
		{
			let deviceData = this.getDeviceData( state.fritzbox, socket );
			
			let deviceObj = {
				name			: state.fritzbox._sockets[socket].name,
				data 			: deviceData,
				capabilities	: [ "onoff", "measure_temperature", "meter_power", "measure_power" ]
			};

			if( typeof iconsMap[ state.fritzbox._sockets[socket].modelId ] === 'string' ) {
				let modelId = state.fritzbox._sockets[socket].modelId;
				deviceObj.icon = `/icons/${iconsMap[modelId]}.svg`;
			}

			result.push( deviceObj );
		}

		callback( null, result );
	}

	// onoff
	_onExportsCapabilitiesOnoffGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesOnoffGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.onoff );
	}
	
	_onExportsCapabilitiesOnoffSet( device_data, value, callback ) {
		this.debug('_onExportsCapabilitiesOnoffSet', device_data.id, value);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );
		
		console.log("set on/off value");
		console.log(value);

		device.state.onoff = value;
		device.save( callback );
	}

	// measure temperature
	_onExportsCapabilitiesMeasureTemperatureGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesMeasureTemperatureGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.measure_temperature );
	}

	// measure power
	_onExportsCapabilitiesMeasurePowerGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesMeasurePowerGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.measure_power );
	}

	// meter power
	_onExportsCapabilitiesMeterPowerGet( device_data, callback ) {
		this.debug('_onExportsCapabilitiesMeterPowerGet', device_data.id);

		let device = this.getDevice( device_data );
		if( device instanceof Error ) return callback( device );

		callback( null, device.state.meter_power );
	}
}

module.exports = new DriverSocket();