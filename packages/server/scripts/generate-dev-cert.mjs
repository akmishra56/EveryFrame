// One-off local dev helper - generates a self-signed TLS cert/key for the backend so it can
// serve https://localhost:4000 directly, matching the frontend's own self-signed dev cert
// (see packages/web/vite.config.ts). Never used in production - see docs/architecture.md.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const __dirname = dirname(fileURLToPath(import.meta.url));
const certsDir = join(__dirname, '..', 'certs');
const certPath = join(certsDir, 'localhost-cert.pem');
const keyPath = join(certsDir, 'localhost-key.pem');

if (existsSync(certPath) && existsSync(keyPath)) {
  console.log(`Cert already exists at ${certPath} - delete it first to regenerate.`);
  process.exit(0);
}

const attrs = [{ name: 'commonName', value: 'localhost' }];
// selfsigned@5+ - generate() is async, and the private key comes back as `private`, not `key`.
const pems = await selfsigned.generate(attrs, {
  days: 825,
  keySize: 2048,
  extensions: [
    { name: 'basicConstraints', cA: true },
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' }, // DNS
        { type: 7, ip: '127.0.0.1' }, // IP
        { type: 7, ip: '::1' },
      ],
    },
  ],
});

mkdirSync(certsDir, { recursive: true });
writeFileSync(certPath, pems.cert);
writeFileSync(keyPath, pems.private);
console.log(`Generated ${certPath} and ${keyPath}`);
