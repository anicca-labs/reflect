import aesjs from 'aes-js';

const PREFIX = 'enc:v1:';
const IV_BYTES = 16;

const keyFromEnv = (): Uint8Array => {
  const b64 = process.env.EXPO_PUBLIC_ENTRIES_ENCRYPTION_KEY;
  if (!b64) throw new Error('EXPO_PUBLIC_ENTRIES_ENCRYPTION_KEY is not set');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const randomIV = (): Uint8Array => {
  const bytes = new Uint8Array(IV_BYTES);
  // globalThis.crypto is the correct reference in React Native / Hermes
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    // fallback: timestamp + Math.random (adequate for app-level encryption)
    const t = Date.now();
    for (let i = 0; i < 8; i++) bytes[i] = (t >>> (i * 8)) & 0xff;
    for (let i = 8; i < IV_BYTES; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const encryptContent = (plaintext: string): string => {
  const key = keyFromEnv();
  const iv = randomIV();
  const counter = new aesjs.Counter(Array.from(iv));
  const aesCtr = new aesjs.ModeOfOperation.ctr(Array.from(key), counter);
  const plainBytes = aesjs.utils.utf8.toBytes(plaintext);
  const cipherBytes = aesCtr.encrypt(plainBytes);
  const combined = new Uint8Array(IV_BYTES + cipherBytes.length);
  combined.set(iv, 0);
  combined.set(cipherBytes, IV_BYTES);
  return PREFIX + toBase64(combined);
};

const decryptContent = (value: string): string => {
  if (!value.startsWith(PREFIX)) return value;
  try {
    const key = keyFromEnv();
    const combined = fromBase64(value.slice(PREFIX.length));
    const iv = combined.slice(0, IV_BYTES);
    const cipherBytes = combined.slice(IV_BYTES);
    const counter = new aesjs.Counter(Array.from(iv));
    const aesCtr = new aesjs.ModeOfOperation.ctr(Array.from(key), counter);
    const plainBytes = aesCtr.decrypt(cipherBytes);
    return aesjs.utils.utf8.fromBytes(Array.from(plainBytes));
  } catch {
    return value;
  }
};

export { encryptContent, decryptContent, PREFIX };
