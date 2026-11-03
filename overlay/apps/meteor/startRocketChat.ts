// FOSS build entry point. Replaces both the licensed startRocketChat.ts and the empty
// startRocketChatFOSS.ts shipped upstream: the only thing a FOSS monolith needs here is to
// feed DDP connections into the presence service (the upstream hooks live in licensed code).
import { startPresenceHooks } from './server/foss/startup/presence';

export const startRocketChat = async () => {
	startPresenceHooks();
};
