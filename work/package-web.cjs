// Compatibility entry point kept for old notes. The old implementation
// depended on an absolute Codex temp directory and packaged v1.8.2 output.
// Current releases must use the repository-owned source and release pipeline.
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const command = process.execPath;
const args = [path.join(root, 'tools', 'release-web.cjs'), ...process.argv.slice(2)];
const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
if (result.error) throw result.error;
process.exitCode = result.status || 0;
