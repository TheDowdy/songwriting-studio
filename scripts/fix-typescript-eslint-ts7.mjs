#!/usr/bin/env node
/**
 * Phase 0 workaround (see PLAN.md §7 Phase 0, §8): `typescript-eslint` and several of its
 * sub-packages hard-crash at require() time when they see TypeScript >= 7 — not a lint-rule
 * issue, an import-time `throw`. Upstream tracking:
 * https://github.com/typescript-eslint/typescript-eslint/issues/10940
 *
 * The plan says: use TypeScript ^7 for `tsc -b` everywhere, and "don't downgrade TS to satisfy
 * the linter". So the *project's* TypeScript (used by tsc, vite, everything else) stays on ^7,
 * hoisted at the workspace root as normal. This script privately nests an older TypeScript
 * (5.9.x, last version typescript-eslint 8.x supports) inside just the node_modules folders of
 * the packages that do this version check / touch old TS-internal APIs, so ESLint's
 * non-type-aware rules can run. Nothing outside those packages' own resolution sees it.
 *
 * Runs automatically via the root "postinstall" script. Safe to re-run; it no-ops once the
 * nested copies are already in place. Delete this file (and the postinstall hook) once
 * typescript-eslint supports TS 7.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, cpSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = path.join(rootDir, 'node_modules');
const OLD_TS_VERSION = '5.9.3';

// Packages (relative to node_modules/) whose own code resolves `typescript` independently and
// breaks under TS 7. Found by iterating: run `npm run lint`, nest a copy where the next crash
// points, repeat until clean.
const TARGETS = [
  'typescript-eslint',
  '@typescript-eslint/eslint-plugin',
  '@typescript-eslint/parser',
  '@typescript-eslint/project-service',
  '@typescript-eslint/scope-manager',
  '@typescript-eslint/tsconfig-utils',
  '@typescript-eslint/type-utils',
  '@typescript-eslint/types',
  '@typescript-eslint/typescript-estree',
  '@typescript-eslint/utils',
  '@typescript-eslint/visitor-keys',
  'ts-api-utils',
];

function rootTsMajor() {
  const pkgPath = path.join(nodeModules, 'typescript', 'package.json');
  if (!existsSync(pkgPath)) return null;
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return Number(version.split('.')[0]);
}

function alreadyPatched(targetDir) {
  const pkgPath = path.join(targetDir, 'node_modules', 'typescript', 'package.json');
  if (!existsSync(pkgPath)) return false;
  const { version } = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return version === OLD_TS_VERSION;
}

function main() {
  if (rootTsMajor() === null || rootTsMajor() < 7) {
    // Nothing to work around — typescript-eslint supports the installed TS directly.
    return;
  }

  const existingTargets = TARGETS.map((t) => path.join(nodeModules, t)).filter((d) =>
    existsSync(path.join(d, 'package.json')),
  );
  if (existingTargets.length === 0) return; // typescript-eslint isn't installed here

  if (existingTargets.every(alreadyPatched)) {
    console.log('[fix-typescript-eslint-ts7] already patched, skipping.');
    return;
  }

  console.log(
    `[fix-typescript-eslint-ts7] TypeScript ${rootTsMajor()}.x detected; typescript-eslint ` +
      `needs <7 (see comment in this script). Fetching typescript@${OLD_TS_VERSION} for its ` +
      'private use only...',
  );

  const scratch = mkdtempSync(path.join(tmpdir(), 'ts-eslint-fix-'));
  try {
    execFileSync('npm', ['install', `typescript@${OLD_TS_VERSION}`, '--no-save', '--prefix', scratch], {
      stdio: 'inherit',
    });
    const oldTsSrc = path.join(scratch, 'node_modules', 'typescript');
    if (!existsSync(oldTsSrc)) {
      console.warn('[fix-typescript-eslint-ts7] fetch failed; leaving `npm run lint` broken.');
      return;
    }
    for (const dir of existingTargets) {
      const dest = path.join(dir, 'node_modules', 'typescript');
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(path.dirname(dest), { recursive: true });
      cpSync(oldTsSrc, dest, { recursive: true });
    }
    console.log(`[fix-typescript-eslint-ts7] nested typescript@${OLD_TS_VERSION} into ${existingTargets.length} package(s).`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// It only exists so `npm run lint` works locally, so it must never break an install: skip it on
// Vercel (which builds, never lints), and treat any failure as a warning.
if (process.env.VERCEL) {
  console.log('[fix-typescript-eslint-ts7] Vercel build: lint workaround not needed, skipping.');
} else {
  try {
    main();
  } catch (err) {
    console.warn(`[fix-typescript-eslint-ts7] skipped (${err instanceof Error ? err.message : err}); \`npm run lint\` may not work.`);
  }
}
