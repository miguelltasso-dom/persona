/** Disposable profile probe for the actual Electron main/host encryption channel. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** @param {string} home Empty test home. Installs a synthetic-only Cordis probe in its profile. */
export function prepareVaultProof(home) {
  const profile = join(home, 'profiles/persona')
  mkdirSync(profile, { recursive: true })
  writeFileSync(join(profile, 'rivet-vault-proof.mjs'), `import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export const inject = ['personaVault'];
export async function apply(ctx) {
    const home = process.env.PERSONA_HOME;
    const proofPath = join(home, 'vault-proof.json');
    const vault = ctx.personaVault;
    try {
      const secret = 'synthetic-runtime-dpapi-check';
      const restarted = existsSync(proofPath);
      const restored = await vault.vault.get('runtime-proof', 'dsh');
      if (restarted && restored !== secret) throw new Error('restart');
      await vault.vault.set('runtime-proof', 'dsh', secret);
      const roundTrip = await vault.vault.get('runtime-proof', 'dsh') === secret;
      const file = readFileSync(join(home, 'persona-vault.json'), 'utf8');
      const safe = !file.includes(secret) && !file.includes(Buffer.from(secret).toString('base64'));
      const status = vault.status();
      writeFileSync(proofPath, JSON.stringify({ roundTrip, safe, restarted,
        restored: !restarted || restored === secret, status,
        ok: roundTrip && safe && status.protection === 'dpapi' && status.available }));
    } catch (error) {
      writeFileSync(proofPath, JSON.stringify({ ok: false, code: error?.code ?? 'runtime-proof-failed' }));
    }
}
`)
  writeFileSync(join(profile, 'cordis.patch.yml'), '- insert:\n    - id: rivet-vault-proof\n      name: ./rivet-vault-proof.mjs\n')
}

/** @param {string} home Probe home. @param {boolean} restarted Require persisted read after restart. @returns {object} Redacted evidence. */
export function readVaultProof(home, restarted) {
  const proof = JSON.parse(readFileSync(join(home, 'vault-proof.json'), 'utf8'))
  if (proof.ok !== true || (restarted && proof.restarted !== true)) throw new Error(`Native vault proof failed: ${proof.code ?? 'invalid proof'}`)
  return proof
}
