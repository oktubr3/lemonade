// Firestore rules tests for the Env Vault collections.
//
// Run with: pnpm run test:rules
//
// The script pins firebase-tools@13 because 14+ requires JDK 21 and this repo
// runs on JDK 17. Drop the pin once the toolchain moves to 21.
//
// These exist because a rules-hardening pass once validated encryptedValue as
// `is string` while the app has always stored it as a {encrypted, iv} map. That
// rejected every write to env_variables and env_context_files in production
// while still passing a rules *compile* check. Compilation proves nothing about
// whether real documents can be written — only these tests do.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
    initializeTestEnvironment,
    assertSucceeds,
    assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

const RULES_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules');

const UID = 'user1';
// Same shape encryptValue() produces: hex ciphertext + hex IV.
const BLOB = { encrypted: 'ada13090113372add02e6613d822ba231023f3', iv: '441aaba943606b1b7906fe82' };

const testEnv = await initializeTestEnvironment({
    projectId: 'passmanager-test',
    firestore: { rules: readFileSync(RULES_PATH, 'utf8'), host: '127.0.0.1', port: 8080 },
});

await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'env_variables/v1'), {
        userId: UID, projectId: 'p1', fileName: '.env', filePath: 'app/.env',
        variableName: 'SMTP_PORT', encryptedValue: BLOB, category: 'email',
        isSecret: false, createdAt: new Date(),
    });
    await setDoc(doc(db, 'env_context_files/c1'), {
        userId: UID, projectId: 'p1', fileName: 'CLAUDE.md',
        encryptedContent: BLOB, createdAt: new Date(),
    });
    await setDoc(doc(db, 'env_projects/p1'), {
        userId: UID, name: 'app', variablesCount: 1, envFilesCount: 1,
        aiContextFilesCount: 1, createdAt: new Date(),
    });
    await setDoc(doc(db, `env_vault_settings/${UID}`), {
        passwordHash: 'd96d300b', salt: '51266a3176ccfabad78bc951a4690e3e',
        kdfIterations: 600000, verifierVersion: 2, createdAt: new Date(),
    });
});

const db = testEnv.authenticatedContext(UID).firestore();
const attackerDb = testEnv.authenticatedContext('attacker').firestore();
const anonDb = testEnv.unauthenticatedContext().firestore();

const results = [];
const check = async (name, promise) => {
    try {
        await promise;
        results.push({ ok: true, name });
    } catch (e) {
        results.push({ ok: false, name, err: e.message.slice(0, 100) });
    }
};

// --- Writes the app actually performs must be allowed ---
await check('mergeProject: update env_variables with blob', assertSucceeds(
    updateDoc(doc(db, 'env_variables/v1'), { encryptedValue: BLOB, updatedAt: new Date() })));

await check('mergeProject: create env_variables with blob', assertSucceeds(
    setDoc(doc(db, 'env_variables/v2'), {
        userId: UID, projectId: 'p1', fileName: '.env', filePath: 'app/.env',
        variableName: 'NEW_VAR', encryptedValue: BLOB, category: 'config',
        isSecret: false, createdAt: new Date(),
    })));

await check('mergeProject: update env_context_files with blob', assertSucceeds(
    updateDoc(doc(db, 'env_context_files/c1'), { encryptedContent: BLOB, updatedAt: new Date() })));

await check('mergeProject: update project counters', assertSucceeds(
    updateDoc(doc(db, 'env_projects/p1'), { variablesCount: 2, updatedAt: new Date() })));

// Key migrations reuse the salt; only the verifier and iterations move.
await check('migration: settings to v3 without touching salt', assertSucceeds(
    updateDoc(doc(db, `env_vault_settings/${UID}`), {
        passwordHash: 'newhash', kdfIterations: 600000, verifierVersion: 3, updatedAt: new Date(),
    })));

// --- Hardening must hold ---
await check('reject: blob stored as plain string', assertFails(
    updateDoc(doc(db, 'env_variables/v1'), { encryptedValue: 'plainstring' })));

await check('reject: blob missing iv', assertFails(
    updateDoc(doc(db, 'env_variables/v1'), { encryptedValue: { encrypted: 'abc' } })));

await check('reject: blob with extra key', assertFails(
    updateDoc(doc(db, 'env_variables/v1'), { encryptedValue: { ...BLOB, evil: 'x' } })));

await check('reject: oversized blob', assertFails(
    updateDoc(doc(db, 'env_variables/v1'), { encryptedValue: { encrypted: 'a'.repeat(100001), iv: 'bb' } })));

await check('reject: salt rotation', assertFails(
    updateDoc(doc(db, `env_vault_settings/${UID}`), { salt: 'deadbeef', updatedAt: new Date() })));

await check('reject: kdfIterations downgrade', assertFails(
    updateDoc(doc(db, `env_vault_settings/${UID}`), { kdfIterations: 100000 })));

await check("reject: another user's variable", assertFails(
    updateDoc(doc(attackerDb, 'env_variables/v1'), { encryptedValue: BLOB })));

await check('reject: unauthenticated write', assertFails(
    setDoc(doc(anonDb, 'env_variables/v3'), {
        userId: UID, projectId: 'p1', variableName: 'X', encryptedValue: BLOB, createdAt: new Date(),
    })));

for (const r of results) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.err ? `\n    ${r.err}` : ''}`);
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);

await testEnv.cleanup();
process.exit(failed.length ? 1 : 0);
