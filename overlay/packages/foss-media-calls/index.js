'use strict';

const { EventEmitter } = require('events');

// The MIT MediaCallService wires itself to this server at startup. In a FOSS build there is no
// call server: listeners are accepted and never fire, and any attempt to place a call is refused.

const unavailable = () => {
	const err = new Error('Media calls are not available in this Rocket.Chat FOSS build');
	err.error = 'error-media-calls-unavailable';
	return err;
};

const callServer = {
	emitter: new EventEmitter(),
	configure: () => undefined,
	setHooks: () => undefined,
	receiveCallUpdate: () => undefined,
	receiveSignal: async (_uid, _signal, options) => {
		if (options?.throwIfSkipped) {
			throw unavailable();
		}
	},
	hangupExpiredCalls: async () => undefined,
	scheduleExpirationCheck: () => undefined,
	requestCall: async () => {
		throw unavailable();
	},
};

const getSignalsForExistingCall = async () => [];

module.exports = { callServer, getSignalsForExistingCall };
