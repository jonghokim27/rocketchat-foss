'use strict';

// A FOSS build carries no license. Every question the MIT code asks gets the answer
// an unlicensed workspace gets: no module, no valid license, nothing to prevent.

const noop = () => undefined;

class DuplicatedLicenseError extends Error {
	constructor(message = 'Duplicated license') {
		super(message);
		this.name = 'DuplicatedLicenseError';
	}
}

const License = {
	hasModule: () => false,
	hasValidLicense: () => false,
	hasOfflineLicense: () => false,
	shouldPreventAction: async () => false,
	getLicense: () => undefined,
	getModules: () => [],
	getTags: () => [],
	getGuestPermissions: async () => [],
	getWorkspaceUrl: () => undefined,
	getHashedWorkspaceUrl: () => '',
	getLimit: async () => -1,
	getMaxActiveUsers: () => -1,
	getUnmodifiedLicenseAndModules: () => undefined,
	getInfo: async () => ({ license: undefined, activeModules: [], preventedActions: {}, limits: {}, tags: [], trial: false }),
	setLicense: async () => false,
	remove: async () => undefined,
	onValidateLicense: noop,
	onInvalidateLicense: noop,
	onValidFeature: noop,
	onInvalidFeature: noop,
	onToggledFeature: noop,
	onModule: noop,
	onLimitReached: noop,
	onBehaviorTriggered: noop,
	onBehaviorToggled: noop,
	onInstall: noop,
	onChange: noop,
	onRemoveLicense: noop,
	setLicenseLimitCounter: noop,
};

// Air-gapped restriction is an Enterprise mechanism. A FOSS workspace is never restricted.
const AirGappedRestriction = {
	restricted: false,
	computeRestriction: async () => undefined,
	on: noop,
	once: noop,
	off: noop,
	isWarningPeriod: () => false,
};

const applyLicense = async () => false;

module.exports = {
	License,
	AirGappedRestriction,
	DuplicatedLicenseError,
	applyLicense,
};
