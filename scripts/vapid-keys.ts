/**
 * Generates a VAPID key pair for web push.
 *
 *   npx tsx scripts/vapid-keys.ts
 *
 * Run once per environment and keep the pair together: the private key signs
 * each push and the service checks it against the public key the browser
 * subscribed with. Changing the pair invalidates every existing subscription,
 * so production and development want their own and neither wants to rotate
 * casually.
 */

import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:bcjeducational@gmail.com`);
