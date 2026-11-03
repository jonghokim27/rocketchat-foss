'use strict';

const { ServiceClass } = require('@rocket.chat/core-services');

// Registered under the same names as the Enterprise services so callers get an explicit,
// logged no-op instead of a silently missing service.

class QueueWorker extends ServiceClass {
	constructor(_db, Logger) {
		super();
		this.name = 'queue-worker';
		this.logger = Logger ? new Logger('QueueWorker') : console;
	}

	async queueWork(queue, to) {
		this.logger.warn({ msg: 'Queue worker is not available in this FOSS build; work dropped', queue, to });
	}

	async queueInfo() {
		return [];
	}
}

class OmnichannelTranscript extends ServiceClass {
	constructor(Logger) {
		super();
		this.name = 'omnichannel-transcript';
		this.logger = Logger ? new Logger('OmnichannelTranscript') : console;
	}

	async workOnPdf({ details } = {}) {
		this.logger.warn({ msg: 'PDF transcripts are not available in this FOSS build', rid: details?.rid });
	}
}

module.exports = { QueueWorker, OmnichannelTranscript };
