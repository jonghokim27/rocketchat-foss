'use strict';

const { randomBytes } = require('crypto');

/** A Matrix user id looks like `@localpart:server.name`. */
const validateFederatedUsername = (username) =>
	typeof username === 'string' && /^@[^:\s]+:[^:\s]+(:\d+)?$/.test(username.trim());

/** An Ed25519 secret key seed is 32 random bytes. Used only to fill a settings default. */
const generateEd25519RandomSecretKey = () => randomBytes(32);

module.exports = { validateFederatedUsername, generateEd25519RandomSecretKey };
