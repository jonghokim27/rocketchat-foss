import type { EventEmitter } from 'events';

export type IMediaCallServerSettings = Record<string, any>;
export type PreCallCreatedHookParams = any;
export type PreCallCreatedHookResult = any;
export type VoipPushNotificationType = string;
export type VoipPushNotificationEventType = string;

export declare const callServer: { emitter: EventEmitter } & Record<string, (...args: any[]) => any>;
export declare function getSignalsForExistingCall(...args: any[]): Promise<any[]>;
