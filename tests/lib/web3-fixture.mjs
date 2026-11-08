// Explicit maintainer/CI tooling. No imports from normal startup or game policy.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = path.join(root, 'tests/fixtures/web3');
const require = createRequire(path.join(fixture, 'package.json'));
export const viem = require('viem');
export const solc = require('solc');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function compile(sources) {
  if (!solc.version().startsWith('0.8.28+')) throw new Error('Use the exact explicitly installed solc0.8.28 fixture.');
  const normalized = Object.fromEntries(Object.entries(sources).map(([name, body]) => [name, typeof body === 'string' ? { content: body } : body]));
  const input = { language: 'Solidity', sources: normalized, settings: { evmVersion: 'cancun', optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } } } };
  const output = JSON.parse(solc.compile(JSON.stringify(input), { import(importPath) {
    if (!/^@openzeppelin\/contracts\/[A-Za-z0-9_./-]+\.sol$/.test(importPath) || importPath.split('/').includes('..'))
      return { error: 'Only confined reviewed OpenZeppelin imports are supported in this fixture.' };
    return { contents: fs.readFileSync(path.join(fixture, 'node_modules', importPath), 'utf8') };
  } }));
  const errors = output.errors?.filter(error => error.severity === 'error') || [];
  if (errors.length) throw new Error(errors.map(error => error.formattedMessage).join('\n').slice(0, 6000));
  return Object.fromEntries(Object.entries(output.contracts).map(([source, contracts]) => [source,
    Object.fromEntries(Object.entries(contracts).map(([name, contract]) => [name, { abi: contract.abi,
      bytecode: '0x' + contract.evm.bytecode.object, deployedBytecode: '0x' + contract.evm.deployedBytecode.object }]))]));
}

async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const number = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return number;
}

export async function withChain(callback, { chainId = 31337 } = {}) {
  if (!Number.isSafeInteger(chainId) || chainId < 1 || typeof callback !== 'function') throw new Error('Invalid local fixture chain.');
  const platform = { win32: 'win32', linux: 'linux', darwin: 'darwin' }[process.platform];
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch];
  if (!platform || !arch) throw new Error('The explicit local Anvil fixture is unavailable on this platform.');
  const binary = path.join(fixture, 'node_modules', '@foundry-rs', `anvil-${platform}-${arch}`, 'bin', process.platform === 'win32' ? 'anvil.exe' : 'anvil');
  if (!fs.existsSync(binary)) throw new Error('Install the pinned fixture explicitly with npm ci --ignore-scripts before EVM tests.');
  const number = await port(), url = 'http://127.0.0.1:' + number;
  // No external interfaces, state dump, private-key logging or global service.
  const child = spawn(binary, ['--host', '127.0.0.1', '--port', String(number), '--chain-id', String(chainId), '--hardfork', 'cancun', '--accounts', '4', '--silent'],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
  let spawnError, ended = false;
  child.on('error', error => { spawnError = error; });
  child.once('exit', () => { ended = true; });
  const chain = viem.defineChain({ id: chainId, name: 'Disposable local EVM fixture',
    nativeCurrency: { name: 'Local test value', symbol: chainId === 13371 ? 'IMX' : 'ETH', decimals: 18 }, rpcUrls: { default: { http: [url] } } });
  const transport = () => viem.http(url, { retryCount: 0, timeout: 1000 });
  const publicClient = viem.createPublicClient({ chain, transport: transport(), pollingInterval: 30 });
  try {
    const deadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < deadline) {
      if (spawnError || ended) throw new Error('Local Anvil fixture did not start.');
      try { ready = await publicClient.getChainId() === chainId; } catch { /* bounded local startup */ }
      if (ready) break;
      await pause(50);
    }
    if (!ready) throw new Error('Local EVM startup deadline exceeded.');
    const accounts = await publicClient.request({ method: 'eth_accounts' });
    const wallets = accounts.map(account => viem.createWalletClient({ account, chain, transport: transport(), pollingInterval: 30 }));
    return await callback({ publicClient, wallets, accounts, chain, url });
  } finally {
    if (!ended && child.pid) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await Promise.race([exited, pause(3000)]);
      if (!ended) { child.kill('SIGKILL'); await Promise.race([exited, pause(3000)]); }
      if (!ended) throw new Error('Local EVM process cleanup was not confirmed.');
    }
  }
}
