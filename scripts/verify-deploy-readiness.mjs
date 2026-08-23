import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const appDir = path.join(repoRoot, 'snor-live-main');
const srcDir = path.join(appDir, 'src');
const migrationsDir = path.join(repoRoot, 'supabase', 'migrations');
const vercelConfigPath = path.join(repoRoot, 'vercel.json');
const readmePath = path.join(repoRoot, 'README.md');

const requiredEnvVars = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_LIVEKIT_URL',
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function listFiles(dir, extension, collected = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(fullPath, extension, collected);
      continue;
    }
    if (fullPath.endsWith(extension)) {
      collected.push(fullPath);
    }
  }
  return collected;
}

function fail(message) {
  console.error(`❌ ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`✅ ${message}`);
}

if (!fs.existsSync(appDir)) fail(`Missing app directory: ${appDir}`);
if (!fs.existsSync(migrationsDir)) fail(`Missing migrations directory: ${migrationsDir}`);
if (!fs.existsSync(vercelConfigPath)) fail(`Missing vercel.json: ${vercelConfigPath}`);
if (!fs.existsSync(readmePath)) fail(`Missing README.md: ${readmePath}`);

if (!process.exitCode) {
  const vercelConfig = JSON.parse(readText(vercelConfigPath));
  if (vercelConfig.installCommand !== 'npm ci') {
    fail('vercel.json installCommand must be "npm ci".');
  } else {
    pass('vercel.json installCommand is "npm ci".');
  }

  if (vercelConfig.buildCommand !== 'npm run build') {
    fail('vercel.json buildCommand must be "npm run build".');
  } else {
    pass('vercel.json buildCommand is "npm run build".');
  }

  if (vercelConfig.outputDirectory !== 'dist') {
    fail('vercel.json outputDirectory must be "dist".');
  } else {
    pass('vercel.json outputDirectory is "dist".');
  }

  const readme = readText(readmePath);
  if (!readme.includes('Root Directory') || !readme.includes('`snor-live-main`')) {
    fail('README must document Vercel Root Directory as `snor-live-main`.');
  } else {
    pass('README documents Vercel Root Directory as `snor-live-main`.');
  }

  const envExamplePath = path.join(appDir, '.env.example');
  if (!fs.existsSync(envExamplePath)) {
    fail(`Missing .env.example at ${envExamplePath}.`);
  } else {
    const envExample = readText(envExamplePath);
    for (const envVar of requiredEnvVars) {
      if (!envExample.includes(`${envVar}=`)) {
        fail(`.env.example must include ${envVar}.`);
      } else {
        pass(`.env.example includes ${envVar}.`);
      }
    }
  }

  const migrationFiles = listFiles(migrationsDir, '.sql');
  const migrationsContent = migrationFiles.map((file) => readText(file)).join('\n');
  const functionNames = new Set();

  const functionRegex = /create\s+or\s+replace\s+function\s+(?:[\w"]+\.)?([\w"]+)\s*\(/gi;
  let functionMatch = functionRegex.exec(migrationsContent);
  while (functionMatch) {
    functionNames.add(functionMatch[1].replaceAll('"', '').toLowerCase());
    functionMatch = functionRegex.exec(migrationsContent);
  }

  const rpcNames = new Set();
  const sourceFiles = listFiles(srcDir, '.ts').concat(listFiles(srcDir, '.tsx'));
  const rpcRegex = /supabase\.rpc\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g;
  for (const file of sourceFiles) {
    const content = readText(file);
    let match = rpcRegex.exec(content);
    while (match) {
      rpcNames.add(match[1].toLowerCase());
      match = rpcRegex.exec(content);
    }
    rpcRegex.lastIndex = 0;
  }

  const missingRpcs = [...rpcNames].filter((rpc) => !functionNames.has(rpc));
  if (missingRpcs.length > 0) {
    fail(`Missing SQL function definitions for RPCs: ${missingRpcs.sort().join(', ')}`);
  } else {
    pass(`All ${rpcNames.size} RPCs referenced in frontend exist in migrations.`);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log('🎉 Deployment readiness checks passed.');
