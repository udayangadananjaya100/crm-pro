const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

async function main() {
  const port = await getFreePort();
  const dbPath = path.join(os.tmpdir(), `procrm-smoke-${process.pid}.db`);
  cleanupDb(dbPath);

  const env = {
    ...process.env,
    NODE_ENV: 'development',
    PORT: String(port),
    SQLITE_DB_PATH: dbPath,
    JWT_SECRET: 'smoke-test-secret',
    LOG_LEVEL: 'error',
  };

  run('node', ['db/migrate.js'], env);
  run('node', ['db/seed.js'], env);

  const server = spawn('node', ['src/index.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  try {
    await waitForServer(port);

    const setupStatus = await request(port, '/api/setup/status');
    assert(setupStatus.setup_required === false, 'seeded database still requires setup');

    const login = await request(port, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@procrm.com', password: 'admin123' }),
    });
    assert(login.token, 'login token missing');
    const auth = { Authorization: `Bearer ${login.token}` };

    const contacts = await request(port, '/api/contacts?limit=1', { headers: auth });
    assert(contacts.contacts?.length === 1, 'contacts endpoint failed');
    const contactId = contacts.contacts[0].id;

    const conversations = await request(port, '/api/conversations?limit=1', { headers: auth });
    assert(conversations.conversations?.length === 1, 'conversations endpoint failed');
    const conversationId = conversations.conversations[0].id;

    const checks = [
      request(port, '/api/system/public-settings'),
      request(port, '/api/dashboard/stats', { headers: auth }),
      request(port, '/api/analytics/volume', { headers: auth }),
      request(port, '/api/analytics/leaderboard', { headers: auth }),
      request(port, `/api/contacts/${contactId}/intelligence`, { headers: auth }),
      request(port, `/api/contacts/${contactId}/timeline`, { headers: auth }),
      request(port, '/api/shifts/active', { headers: auth }),
      request(port, '/api/knowledge/documents/fake-id', { method: 'DELETE', headers: auth }),
      request(port, '/api/scheduled-messages', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: 'Smoke scheduled message',
          scheduledFor: new Date(Date.now() + 3600000).toISOString(),
        }),
      }),
    ];

    const results = await Promise.all(checks);
    assert(results[0].company_name, 'public settings failed');
    assert(Number.isInteger(results[1].active_contacts), 'dashboard stats failed');
    assert(Array.isArray(results[2]), 'analytics volume failed');
    assert(Array.isArray(results[3]), 'leaderboard failed');
    assert(Number.isInteger(results[4].interactionCount), 'intelligence failed');
    assert(Array.isArray(results[5].timeline), 'timeline failed');
    assert(Object.prototype.hasOwnProperty.call(results[6], 'shift'), 'shifts failed');
    assert(results[7].success === true, 'knowledge delete failed');
    assert(results[8].status === 'pending', 'scheduled message failed');

    console.log('Smoke tests passed');
  } finally {
    server.kill();
    await waitForExit(server);
    cleanupDb(dbPath);
    if (server.exitCode && server.exitCode !== 0) {
      console.error(serverOutput);
    }
  }
}

function waitForExit(child) {
  if (child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => child.once('exit', () => setTimeout(resolve, 250)));
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

async function request(port, pathname, options = {}) {
  const res = await fetch(`http://localhost:${port}${pathname}`, options);
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`${pathname} failed (${res.status}): ${text}`);
  }
  return data;
}

async function waitForServer(port) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try {
      await request(port, '/api/health');
      return;
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Server did not become ready');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function cleanupDb(dbPath) {
  for (const file of [dbPath, `${dbPath}-shm`, `${dbPath}-wal`]) {
    try {
      fs.unlinkSync(file);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
