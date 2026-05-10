/**
 * Ovyra launcher — spawns Electron with a clean env.
 *
 * Some systems set ELECTRON_RUN_AS_NODE=1 globally (it makes Electron behave
 * like plain Node). That breaks the main process — `require('electron')` returns
 * the binary path instead of the API, so `app`, `BrowserWindow`, etc. are
 * undefined. This wrapper removes the var before spawning Electron.
 */
const { spawn } = require('node:child_process');
const electronPath = require('electron'); // string path to electron.exe in plain Node

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: false
});

child.on('close', (code, signal) => {
  if (code === null) { console.error('Electron exited with signal', signal); process.exit(1); }
  process.exit(code);
});

['SIGINT', 'SIGTERM'].forEach(sig => {
  process.on(sig, () => { try { child.kill(sig); } catch {} });
});
