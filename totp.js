export function decodeSecretToBytes(secret, format = 'base32') {
  const s = secret.trim();
  if (!s) throw new Error('Empty secret');

  switch (format) {
    case 'base32': return base32ToBytes(s);
    case 'base64': return base64ToBytes(s);
    case 'hex': return hexToBytes(s);
    default: throw new Error('Unsupported format: ' + format);
  }
}

export async function hotp(keyBytes, counter, digits = 6, algorithm = 'SHA-1') {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setBigUint64(0, BigInt(counter), false);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: algorithm }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));

  const offset = sig[sig.length - 1] & 0x0f;
  const code = ((sig[offset] & 0x7f) << 24) |
               ((sig[offset + 1] & 0xff) << 16) |
               ((sig[offset + 2] & 0xff) << 8) |
               (sig[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, '0');
}

export async function totp(keyBytes, {
  digits = 6,
  period = 30,
  algorithm = 'SHA-1',
  timestamp = Math.floor(Date.now() / 1000)
} = {}) {
  const counter = Math.floor(timestamp / period);
  return hotp(keyBytes, counter, digits, algorithm);
}

// === helpers ===
function base32ToBytes(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0, value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error('Invalid Base32 char: ' + ch);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex) {
  hex = hex.replace(/^0x/, '').replace(/\s+/g, '');
  if (hex.length % 2) hex = '0' + hex;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
