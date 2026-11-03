import { Presence } from '@rocket.chat/core-services';
import { InstanceStatus } from '@rocket.chat/instance-status';
import { Logger } from '@rocket.chat/logger';
import { Accounts } from 'meteor/accounts-base';
import { Meteor } from 'meteor/meteor';

const logger = new Logger('FossPresence');

/**
 * Only real DDP sessions count as presence. REST logins also run the login hooks but with a
 * synthetic connection that never closes; counting those would keep users online forever.
 */
const isDdpSession = (connectionId: string | undefined): connectionId is string =>
	Boolean(connectionId && (Meteor.server as any).sessions?.has(connectionId));

export const startPresenceHooks = (): void => {
	const nodeId = InstanceStatus.id();

	Meteor.onConnection((connection) => {
		connection.onClose(() => {
			Presence.removeConnection(undefined, connection.id, nodeId).catch((err) =>
				logger.error({ msg: 'removeConnection failed', err }),
			);
		});
	});

	Accounts.onLogin((login: any) => {
		const uid = login.user?._id;
		const connectionId = login.connection?.id;
		if (!uid || !isDdpSession(connectionId)) {
			return;
		}
		Presence.newConnection(uid, connectionId, nodeId).catch((err) => logger.error({ msg: 'newConnection failed', err }));
	});

	Accounts.onLogout((login: any) => {
		const connectionId = login.connection?.id;
		if (!connectionId) {
			return;
		}
		Presence.removeConnection(login.user?._id, connectionId, nodeId).catch((err) =>
			logger.error({ msg: 'removeConnection failed', err }),
		);
	});
};
