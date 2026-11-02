// Makes the key pair for browser notifications (Web Push).
// Run once:  node scripts/vapid-keys.mjs
// Then paste the two lines it prints into .env (and Netlify). Keep the private one secret.
import { createECDH } from 'node:crypto';

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
console.log(`VAPID_PUBLIC_KEY=${b64url(ecdh.getPublicKey())}`);
console.log(`VAPID_PRIVATE_KEY=${b64url(ecdh.getPrivateKey())}`);
