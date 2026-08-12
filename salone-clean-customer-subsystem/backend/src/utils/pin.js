// ============================================================================
// pin.js — Salt + hash a customer's 4-digit login PIN using Node's built-in
// crypto module (scrypt). No extra dependency needed. Storage format is
// "salt:hash", both hex-encoded, so verification doesn't need a separate
// salt column.
//
// NOTE: a 4-digit PIN has limited entropy (10,000 possibilities) — fine for
// this local/demo build alongside phone-number-based lookup, but if this
// ever handles real customer funds, pair it with rate limiting on the
// login endpoint and consider a longer PIN or a real password.
// ============================================================================

const crypto = require('crypto');

const KEY_LENGTH = 64;

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const candidateHash = crypto.scryptSync(String(pin), salt, KEY_LENGTH).toString('hex');
  // Constant-time comparison to avoid leaking timing information.
  const a = Buffer.from(originalHash, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { hashPin, verifyPin };
