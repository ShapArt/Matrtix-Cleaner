import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function commandOk(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

const checks = {
  node: { ok: true, stdout: process.version },
  npm: commandOk('npm'),
  npx: commandOk('npx'),
};

const localNode = path.join(process.cwd(), '.bootstrap', 'node', process.platform === 'win32' ? 'node.exe' : 'bin/node');
const localNpm = path.join(process.cwd(), '.bootstrap', 'node', process.platform === 'win32' ? 'npm.cmd' : 'bin/npm');
checks.localNode = { ok: fs.existsSync(localNode), stdout: localNode };
checks.localNpm = { ok: fs.existsSync(localNpm), stdout: localNpm };

Object.entries(checks).forEach(([name, result]) => {
  const detail = result.stdout || result.stderr || `exit=${result.status}`;
  process.stdout.write(`${result.ok ? 'OK' : 'WARN'} ${name}: ${detail}\n`);
});

if (!checks.npm.ok && !checks.localNpm.ok) {
  process.stdout.write('WARN npm is not available on PATH and local bootstrap is missing. Run scripts/verify.ps1 or verify.cmd.\n');
}
