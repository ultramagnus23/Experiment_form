// Prints a scrypt hash for ADMIN_PASSWORD_HASH.
// Usage: npx tsx scripts/hash-admin-password.ts  (type the password, press Enter, then Ctrl+D; Ctrl+Z then Enter on Windows)
// The password is read from stdin only; it is never echoed or stored.
import { hashAdminPassword } from '../src/lib/admin-password';

async function main() {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  if (password.length < 12) {
    console.error('Use a password of at least 12 characters.');
    process.exit(1);
  }
  console.log(hashAdminPassword(password));
}

main();
