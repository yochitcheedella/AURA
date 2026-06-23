// set_secrets.mjs
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const envRaw = readFileSync(join(__dirname, '.env'), 'utf8');
const envVars = {};
for (const line of envRaw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;
    envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
}

const secrets = [
    'DATABASE_URL',
    'CLERK_FRONTEND_API_URL',
    'CLERK_WEBHOOK_SECRET'
];

for (const key of secrets) {
    const value = envVars[key];
    if (value && !value.includes('xxxx')) {
        console.log(`Setting secret: ${key}...`);
        try {
            execSync(`npx wrangler pages secret put ${key} --project-name aura-assistant`, {
                input: value,
                stdio: ['pipe', 'inherit', 'inherit']
            });
        } catch (e) {
            console.error(`Failed to set ${key}:`, e.message);
        }
    } else {
        console.log(`Skipping ${key} (not set or contains placeholder)`);
    }
}
console.log('Secrets applied successfully!');
