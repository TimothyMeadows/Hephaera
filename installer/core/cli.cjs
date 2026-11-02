#!/usr/bin/env node
'use strict';
const { createInstaller } = require('./index.cjs');
function main(args = process.argv.slice(2)) {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node.js 24 or newer is required; nothing was installed.');
  if (!args.length || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    process.stdout.write('Hephaera installer\nCommands: verify, version, install, init, doctor, status, restore, update, repair, recover, deactivate, uninstall\nUse --project PATH for host commands. install/init/repair accept --with-bubo-source. install/init/update accept --dry-run. recover accepts --confirm-quiescent only after reviewing remaining owned workers. deactivate/uninstall accept --remove-bootstrap. All successful install/init operations run the canonical scaffold.\n'); return;
  }
  const command = args.shift(), settings = {}; let project;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--project') { if (project || !args[index + 1]) throw new Error('One explicit --project PATH is required.'); project = args[++index]; }
    else if (argument === '--json') continue;
    else if (argument === '--with-bubo-source' && ['install', 'init', 'repair'].includes(command)) settings.withBuboSource = true;
    else if (argument === '--dry-run' && ['install', 'init', 'update'].includes(command)) settings.dryRun = true;
    else if (argument === '--remove-bootstrap' && ['deactivate', 'uninstall'].includes(command)) settings.removeBootstrap = true;
    else if (argument === '--confirm-quiescent' && command === 'recover') settings.confirmQuiescent = true;
    else throw new Error('Unknown or inapplicable installer argument. See --help.');
  }
  const installer = createInstaller();
  let result;
  if (['verify', 'version', '--version'].includes(command)) result = installer.verify();
  else { if (!project || !Object.hasOwn(installer, command)) throw new Error('Unknown command or missing explicit --project PATH.'); result = installer[command](project, settings); }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
if (require.main === module) { try { main(); } catch (error) { process.stderr.write('Hephaera installer: ' + error.message + '\n'); process.exitCode = 1; } }
module.exports = { main };
