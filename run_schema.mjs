// run_schema.mjs — Execute neon_schema.sql directly against Neon
// Dollar-quote-aware SQL splitter so PL/pgSQL functions work correctly.

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually ────────────────────────────────────────────────────
const envRaw = readFileSync(join(__dirname, '.env'), 'utf8');
const envVars = {};
for (const line of envRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const DATABASE_URL = envVars['DATABASE_URL'];
if (!DATABASE_URL) { console.error('❌ DATABASE_URL not in .env'); process.exit(1); }

// ── Dollar-quote-aware SQL splitter ──────────────────────────────────────
// Splits a PostgreSQL script into individual statements, correctly handling
// $$ ... $$ and $tag$ ... $tag$ dollar-quoting (which can contain semicolons).
function splitSQL(sql) {
    const stmts = [];
    let buf     = '';
    let i       = 0;
    let inDollar = false;
    let dollarTag = '';

    while (i < sql.length) {
        // Check for start/end of dollar-quote
        if (sql[i] === '$') {
            // Find matching closing $
            const tagEnd = sql.indexOf('$', i + 1);
            if (tagEnd !== -1) {
                const tag = sql.slice(i, tagEnd + 1); // e.g. "$$" or "$func$"
                if (inDollar && tag === dollarTag) {
                    buf += tag;
                    i = tagEnd + 1;
                    inDollar  = false;
                    dollarTag = '';
                    continue;
                } else if (!inDollar && /^\$[A-Za-z0-9_]*\$$/.test(tag)) {
                    inDollar  = true;
                    dollarTag = tag;
                    buf += tag;
                    i = tagEnd + 1;
                    continue;
                }
            }
        }

        // Statement boundary — only when NOT inside a dollar-quote
        if (!inDollar && sql[i] === ';') {
            const stmt = buf.trim();
            if (stmt) stmts.push(stmt);
            buf = '';
            i++;
            continue;
        }

        // Single-line comment — skip to end of line
        if (!inDollar && sql[i] === '-' && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') i++;
            continue;
        }

        buf += sql[i++];
    }

    const last = buf.trim();
    if (last) stmts.push(last);

    return stmts.filter(s => s.length > 0);
}

// ── Main ─────────────────────────────────────────────────────────────────
console.log('🔌  Connecting to Neon...\n');
const sql = neon(DATABASE_URL);

const schemaPath = join(__dirname, 'neon_schema.sql');
const schema     = readFileSync(schemaPath, 'utf8');
const statements = splitSQL(schema);

console.log(`📋  Found ${statements.length} SQL statements.\n`);

let passed = 0, failed = 0;

for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const label = stmt.replace(/\s+/g, ' ').slice(0, 80);

    try {
        await sql.query(stmt);
        console.log(`  ✅  [${i + 1}/${statements.length}] ${label}`);
        passed++;
    } catch (err) {
        const safe = ['already exists', 'duplicate', 'does not exist and no new'];
        if (safe.some(s => err.message.toLowerCase().includes(s.toLowerCase()))) {
            console.log(`  ⬜  [${i + 1}/${statements.length}] (skip) ${label}`);
            passed++;
        } else {
            console.error(`  ❌  [${i + 1}/${statements.length}] FAILED`);
            console.error(`      Error:     ${err.message}`);
            console.error(`      Statement: ${stmt.slice(0, 120).replace(/\n/g, ' ')}\n`);
            failed++;
        }
    }
}

console.log('\n' + '─'.repeat(70));
console.log(`Result: ✅ ${passed} passed   ❌ ${failed} failed`);

if (failed === 0) {
    console.log('\n🎉  Neon schema fully applied!');
    console.log('    Tables, indexes, triggers & functions are all ready.\n');
} else {
    console.log('\n⚠️   Review failures above.\n');
    process.exit(1);
}
