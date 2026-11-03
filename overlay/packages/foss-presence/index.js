'use strict';

const { ServiceClass, api } = require('@rocket.chat/core-services');
const { InstanceStatus, Users, UsersSessions } = require('@rocket.chat/models');

// Status values of @rocket.chat/core-typings UserStatus. Kept as strings so this package
// depends only on the two runtime packages it actually calls.
const ONLINE = 'online';
const AWAY = 'away';
const OFFLINE = 'offline';

const USER_PROJECTION = {
	projection: {
		username: 1,
		name: 1,
		roles: 1,
		status: 1,
		statusConnection: 1,
		statusDefault: 1,
		statusText: 1,
		statusSource: 1,
		statusExpiresAt: 1,
		statusId: 1,
	},
};

// How often connections left behind by a dead instance are swept.
const LOST_CONNECTION_SWEEP_MS = 2 * 60 * 1000;

/** online if any connection is online, away if all are away, offline without connections. */
const connectionStatusOf = (connections) => {
	if (!connections || connections.length === 0) {
		return OFFLINE;
	}
	return connections.some((c) => c.status === ONLINE) ? ONLINE : AWAY;
};

/**
 * Without a connection the user is offline. Connected, a status the user chose (busy, away,
 * offline = invisible) wins over the connection; otherwise the connection decides.
 */
const effectiveStatusOf = (statusConnection, statusDefault) => {
	if (statusConnection === OFFLINE) {
		return OFFLINE;
	}
	if (statusDefault && statusDefault !== ONLINE) {
		return statusDefault;
	}
	return statusConnection;
};

const definedOnly = (values) => Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));

class Presence extends ServiceClass {
	constructor() {
		super();
		this.name = 'presence';
		this.broadcastEnabled = true;
		this.localConnections = 0;
		this.peakConnections = 0;
		this.sweepTimer = undefined;
	}

	async started() {
		// Connections recorded by a previous run of this process (or by an instance that died)
		// would otherwise keep their users online forever.
		setTimeout(() => {
			this.removeLostConnections().catch((err) => console.error('[foss-presence] initial sweep failed', err));
			this.reconcileOnlineUsers().catch((err) => console.error('[foss-presence] reconcile failed', err));
		}, 15000);
		this.sweepTimer = setInterval(() => {
			this.removeLostConnections().catch((err) => console.error('[foss-presence] sweep failed', err));
		}, LOST_CONNECTION_SWEEP_MS);
	}

	async stopped() {
		if (this.sweepTimer) {
			clearInterval(this.sweepTimer);
			this.sweepTimer = undefined;
		}
	}

	async newConnection(uid, session, nodeId) {
		if (!uid || !session) {
			return undefined;
		}
		// A connection that logs in again (resume after login) must not be counted twice.
		await UsersSessions.removeConnectionByConnectionId(session);
		await UsersSessions.addConnectionById(uid, { id: session, instanceId: nodeId, status: ONLINE });
		this.localConnections += 1;
		this.peakConnections = Math.max(this.peakConnections, this.localConnections);
		await this.updateUserPresence(uid);
		return { uid, connectionId: session };
	}

	async removeConnection(uid, session, _nodeId) {
		if (!session) {
			return undefined;
		}
		let userId = uid;
		if (!userId) {
			const owner = await UsersSessions.findOne({ 'connections.id': session }, { projection: { _id: 1 } });
			userId = owner?._id;
		}
		const result = await UsersSessions.removeConnectionByConnectionId(session);
		if (result?.modifiedCount) {
			this.localConnections = Math.max(0, this.localConnections - 1);
		}
		if (!userId) {
			return undefined;
		}
		await this.updateUserPresence(userId);
		return { uid: userId, session };
	}

	async updateConnection(uid, connectionId) {
		const result = await UsersSessions.updateOne(
			{ '_id': uid, 'connections.id': connectionId },
			{ $set: { 'connections.$._updatedAt': new Date() } },
		);
		return result?.matchedCount ? { uid, connectionId } : undefined;
	}

	/**
	 * With a node id, drops that node's connections. Without one, drops every connection whose
	 * instance is no longer registered as alive. Returns the users whose connections were dropped.
	 */
	async removeLostConnections(nodeID) {
		let affected;
		if (nodeID) {
			affected = await UsersSessions.findByInstanceId(nodeID).toArray();
			await UsersSessions.removeConnectionsFromInstanceId(nodeID);
		} else {
			const alive = (await InstanceStatus.find({}, { projection: { _id: 1 } }).toArray()).map(({ _id }) => _id);
			if (alive.length === 0) {
				return [];
			}
			affected = await UsersSessions.findByOtherInstanceIds(alive, { projection: { _id: 1 } }).toArray();
			await UsersSessions.removeConnectionsFromOtherInstanceIds(alive);
		}
		const uids = [...new Set(affected.map(({ _id }) => _id))];
		for (const uid of uids) {
			// eslint-disable-next-line no-await-in-loop
			await this.updateUserPresence(uid);
		}
		return uids;
	}

	/** Users marked online/away/busy whose sessions are gone (crash, restart) are recomputed. */
	async reconcileOnlineUsers() {
		const cursor = Users.find({ status: { $nin: [OFFLINE, 'disabled'] } }, { projection: { _id: 1 } });
		for await (const { _id } of cursor) {
			await this.updateUserPresence(_id);
		}
	}

	async setStatus(userId, status, statusText, statusExpiresAt) {
		const $set = definedOnly({
			statusDefault: status,
			statusSource: 'manual',
			statusText,
			statusExpiresAt,
		});
		const $unset = { statusId: '' };
		if (!statusExpiresAt) {
			$unset.statusExpiresAt = '';
		}
		await Users.updateOne({ _id: userId }, { $set, $unset });
		await this.updateUserPresence(userId, { forceBroadcast: true });
		return true;
	}

	/** A temporary claim (meeting, call) that sets the chosen status until it is ended. */
	async setActiveState(userId, newState) {
		await Users.updateOne({ _id: userId }, { $set: definedOnly(newState) });
		await this.updateUserPresence(userId, { forceBroadcast: true });
		return true;
	}

	/** Ends the claim only if it is still the one identified by statusId. */
	async endActiveState(userId, statusId) {
		const filter = statusId ? { _id: userId, statusId } : { _id: userId, statusId: { $exists: true } };
		const result = await Users.updateOne(filter, {
			$set: { statusDefault: ONLINE },
			$unset: { statusId: '', statusSource: '', statusText: '', statusExpiresAt: '' },
		});
		if (!result?.modifiedCount) {
			return false;
		}
		await this.updateUserPresence(userId, { forceBroadcast: true });
		return true;
	}

	async clearActiveState(userId) {
		return this.endActiveState(userId);
	}

	async setConnectionStatus(uid, status, session) {
		const result = await UsersSessions.updateConnectionStatusById(uid, session, status);
		if (!result?.matchedCount) {
			return false;
		}
		await this.updateUserPresence(uid);
		return true;
	}

	toggleBroadcast(enabled) {
		this.broadcastEnabled = Boolean(enabled);
	}

	getConnectionCount() {
		return { current: this.localConnections, max: Number.MAX_SAFE_INTEGER };
	}

	getPeakConnections(reset) {
		const peak = this.peakConnections;
		if (reset) {
			this.resetPeakConnections();
		}
		return peak;
	}

	resetPeakConnections() {
		this.peakConnections = this.localConnections;
	}

	async updateUserPresence(uid, { forceBroadcast = false } = {}) {
		const user = await Users.findOneById(uid, USER_PROJECTION);
		if (!user) {
			return;
		}
		const session = await UsersSessions.findOneById(uid);
		const statusConnection = connectionStatusOf(session?.connections);
		const status = effectiveStatusOf(statusConnection, user.statusDefault);

		const changed = status !== user.status || statusConnection !== user.statusConnection;
		if (changed) {
			await Users.updateOne({ _id: uid }, { $set: { status, statusConnection } });
		}
		if (!this.broadcastEnabled || (!changed && !forceBroadcast)) {
			return;
		}
		const fresh = forceBroadcast ? (await Users.findOneById(uid, USER_PROJECTION)) ?? user : user;
		void api.broadcast('presence.status', {
			user: {
				_id: fresh._id,
				username: fresh.username,
				name: fresh.name,
				roles: fresh.roles,
				status,
				statusText: fresh.statusText,
				statusSource: fresh.statusSource,
				statusExpiresAt: fresh.statusExpiresAt,
			},
			previousStatus: user.status,
		});
	}
}

module.exports = { Presence };
