export declare class DuplicatedLicenseError extends Error {}
export declare const License: Record<string, (...args: any[]) => any>;
export declare const AirGappedRestriction: {
	restricted: boolean;
	computeRestriction(token?: string): Promise<void>;
	on(...args: any[]): void;
	once(...args: any[]): void;
	off(...args: any[]): void;
	isWarningPeriod(...args: any[]): boolean;
};
export declare function applyLicense(...args: any[]): Promise<boolean>;
