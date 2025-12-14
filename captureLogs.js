/*
Copyright 2016 - 2018, Robin de Gruijter (gruijter@hotmail.com)
*/

'use strict';

const Homey = require('homey');
const StdOutFixture = require('fixture-stdout');
const fs = require('fs');
// const util = require('util');

class captureLogs {
	// Log object to keep logs in memory and in persistent storage
	// captures and reroutes Homey's this.log (stdout) and this.err (stderr)

	constructor(opts) {
		this.homey = opts.homey;
		this.logName = opts.name || 'log';
		this.logLength = opts.length || 50;
		this.logFile = `/userdata/${this.logName}.json`;
		this.logArray = [];
		//this.getLogs();
		this.captureStdOut();
		this.captureStdErr();
		// this.homey.log('capture is ready :)');
	}

	getLogs() {
		fs.readFile(this.logFile, 'utf8', (err, data) => {
			if (err) {
				this.homey.error('error reading logfile: ', err.message);
				return [];
			}
			try {
				if (data.length!==0) {
					this.logArray = JSON.parse(data);
				}
			} catch (error) {
				this.homey.error('error parsing logfile: ', error.message);
				return [];
			}
			// this.homey.log('logs retrieved from module');
			return this.logArray;
		});
	}

	saveLogs() {
		fs.writeFile(this.logFile, JSON.stringify(this.logArray), (err) => {
			if (err) {
				this.homey.error('error writing logfile: ', err.message);
			} else {
				this.homey.log('logfile saved');
			}
		});
	}

	deleteLogs() {
		// this.log('deleting logs from frontend');
		this.logArray = [];
		fs.unlink(this.logFile, (err) => {
			if (err) {
				this.homey.error('error deleting logfile: ', err.message);
				return err;
			}
			this.homey.log('logfile deleted');
			return true;
		});
	}

	captureStdOut() {
		// Capture all writes to stdout (e.g. this.log)
		this.captureStdout = new StdOutFixture({ stream: process.stdout });
		this.homey.log('capturing stdout');
		this.captureStdout.capture((string) => {
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
			// return false;	// prevent the write to the original stream
		});
		// captureStdout.release();
	}

	captureStdErr() {
		// Capture all writes to stderr (e.g. this.error)
		this.captureStderr = new StdOutFixture({ stream: process.stderr });
		this.homey.log('capturing stderr');
		this.captureStderr.capture((string) => {
			if (this.logArray.length >= this.logLength) {
				this.logArray.shift();
			}
			this.logArray.push(string);
			// return false;	// prevent the write to the original stream
		});
		// captureStderr.release();
	}

	releaseStdOut() {
		this.captureStdout.release();
	}

	releaseStdErr() {
		this.captureStderr.release();
	}

}

module.exports = captureLogs;
