/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHARED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared');

/**
 * Reads a file from the repository's shared/ directory: test vectors for rules the backend also
 * implements, so both test suites check the same cases. Test-only; read at run time so the
 * production build (whose Docker context is frontend/) never needs the directory.
 */
export function readSharedFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(SHARED_DIR, name), 'utf-8')) as T;
}
