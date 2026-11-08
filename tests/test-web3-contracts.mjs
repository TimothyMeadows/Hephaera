import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile, solc, viem, withChain } from './lib/web3-fixture.mjs';

const names = ['OperatorPolicy.sol', 'GameItems721.sol', 'GameItems1155.sol', 'test/ContractProbe.sol'];
const artifacts = compile(Object.fromEntries(names.map(name => [name,
  fs.readFileSync(fileURLToPath(new URL('../.web3/contracts/' + name, import.meta.url)), 'utf8')])));
const c721 = artifacts['GameItems721.sol'].GameItems721;
const c1155 = artifacts['GameItems1155.sol'].GameItems1155;
const probes = artifacts['test/ContractProbe.sol'];
const zero = viem.zeroAddress;
const eqAddress = (actual, expected) => assert.equal(actual.toLowerCase(), expected.toLowerCase());
const encode = (contract, functionName, args = []) => viem.encodeFunctionData({ abi: contract.abi, functionName, args });

function tools(context) {
  const { publicClient, wallets, accounts } = context;
  const read = (contract, functionName, args = []) => publicClient.readContract({ ...contract, functionName, args });
  async function send(contract, functionName, args = [], actor = 0, value = 0n) {
    const hash = await wallets[actor].writeContract({ ...contract, functionName, args, value, gas: 4_000_000n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success', functionName + ' must succeed');
    return receipt;
  }
  async function reject(contract, functionName, args = [], actor = 0, expected = /revert/i, value = 0n) {
    await assert.rejects(publicClient.simulateContract({ ...contract, functionName, args, account: accounts[actor], value }), expected);
    // Send a real reverting transaction too; an eth_call rejection alone is not settlement evidence.
    const hash = await wallets[actor].writeContract({ ...contract, functionName, args, value, gas: 4_000_000n });
    assert.equal((await publicClient.waitForTransactionReceipt({ hash })).status, 'reverted');
  }
  async function deploy(artifact, args = []) {
    const hash = await wallets[0].deployContract({ ...artifact, args, gas: 8_000_000n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, 'success', 'deployment must succeed');
    assert.ok(receipt.contractAddress);
    return { address: receipt.contractAddress, abi: artifact.abi };
  }
  const deploy721 = (cap = 2n, registry = zero) => deploy(c721,
    ['Game identities', 'GID', 'ipfs://reviewed/', accounts[0], accounts[1], cap, accounts[0], 500, registry]);
  const deploy1155 = (registry = zero) => deploy(c1155,
    ['ipfs://reviewed/{id}.json', accounts[0], accounts[1], [7n, 8n], [5n, 3n], accounts[0], 500, registry]);
  return { read, send, reject, deploy, deploy721, deploy1155 };
}

test('Solidity fixture uses exact compiler and bounded deployable artifacts', () => {
  assert.match(solc.version(), /^0\.8\.28\+/);
  for (const artifact of [c721, c1155]) {
    assert.ok(artifact.bytecode.length > 2);
    assert.ok((artifact.deployedBytecode.length - 2) / 2 < 24576, 'EIP-170 deployment size');
  }
});

test('ERC721 enforces role separation, lifetime identity, holder burns and standard approvals', { timeout: 60000 }, () => withChain(async context => {
  const { accounts, publicClient } = context;
  const { read, send, reject, deploy721 } = tools(context);
  const collection = await deploy721();
  const minterRole = await read(collection, 'MINTER_ROLE');
  assert.equal(await read(collection, 'hasRole', [minterRole, accounts[0]]), false);
  assert.equal(await read(collection, 'hasRole', [viem.zeroHash, accounts[1]]), false);
  await reject(collection, 'mint', [accounts[2]], 0, /AccessControlUnauthorizedAccount/);
  await reject(collection, 'grantRole', [minterRole, accounts[2]], 1, /AccessControlUnauthorizedAccount/);
  await send(collection, 'mint', [accounts[2]], 1);
  eqAddress(await read(collection, 'ownerOf', [1n]), accounts[2]);
  assert.equal(await read(collection, 'tokenURI', [1n]), 'ipfs://reviewed/1');
  const [royaltyReceiver, royalty] = await read(collection, 'royaltyInfo', [1n, 10000n]);
  eqAddress(royaltyReceiver, accounts[0]);
  assert.equal(royalty, 500n);
  assert.equal(await read(collection, 'supportsInterface', ['0x2a55205a']), true);
  await reject(collection, 'transferFrom', [accounts[2], accounts[3], 1n], 0, /ERC721InsufficientApproval/);
  await send(collection, 'approve', [accounts[3], 1n], 2);
  await reject(collection, 'burn', [1n], 3, /HolderOnlyBurn/);
  await send(collection, 'transferFrom', [accounts[2], accounts[3], 1n], 3);
  eqAddress(await read(collection, 'getApproved', [1n]), zero);
  await send(collection, 'burn', [1n], 3);
  await assert.rejects(read(collection, 'ownerOf', [1n]), /ERC721NonexistentToken/);
  await send(collection, 'mint', [accounts[2]], 1);
  eqAddress(await read(collection, 'ownerOf', [2n]), accounts[2]);
  assert.equal(await read(collection, 'totalMinted'), 2n);
  assert.equal(await read(collection, 'circulatingSupply'), 1n);
  await reject(collection, 'mint', [accounts[2]], 1, /LifetimeCapExceeded/);
  await send(collection, 'setApprovalForAll', [accounts[3], true], 2);
  await send(collection, 'setApprovalForAll', [accounts[3], false], 2);
  await reject(collection, 'transferFrom', [accounts[2], accounts[3], 2n], 3, /ERC721InsufficientApproval/);
  await send(collection, 'beginDefaultAdminTransfer', [accounts[3]]);
  await reject(collection, 'acceptDefaultAdminTransfer', [], 3, /AccessControlEnforcedDefaultAdminDelay/);
  await publicClient.request({ method: 'evm_increaseTime', params: [172801] });
  await publicClient.request({ method: 'evm_mine', params: [] });
  await send(collection, 'acceptDefaultAdminTransfer', [], 3);
  eqAddress(await read(collection, 'defaultAdmin'), accounts[3]);
}));

test('ERC721 callback reentry is denied and rejected safe mint rolls back issuance', { timeout: 60000 }, () => withChain(async context => {
  const { read, send, reject, deploy, deploy721 } = tools(context);
  const collection = await deploy721(3n);
  const probe = await deploy(probes.ContractProbe);
  await send(collection, 'grantRole', [await read(collection, 'MINTER_ROLE'), probe.address]);
  await send(probe, 'configure', [collection.address, encode(collection, 'mint', [probe.address]), false, false]);
  await send(collection, 'mint', [probe.address], 1);
  assert.equal(await read(probe, 'reentryAttempted'), true);
  assert.equal(await read(probe, 'reentrySucceeded'), false);
  assert.equal(await read(collection, 'totalMinted'), 1n);
  assert.equal(await read(collection, 'circulatingSupply'), 1n);
  await send(probe, 'configure', [zero, '0x', true, false]);
  await reject(collection, 'mint', [probe.address], 1, /test receiver rejects delivery/);
  assert.equal(await read(collection, 'totalMinted'), 1n);
  assert.equal(await read(collection, 'circulatingSupply'), 1n);
}));

test('ERC1155 checks duplicate issuance, quantities, holder burns, callbacks and bounded supply', { timeout: 60000 }, () => withChain(async context => {
  const { accounts } = context;
  const { read, send, reject, deploy, deploy1155 } = tools(context);
  const collection = await deploy1155();
  await reject(collection, 'mint', [accounts[2], 7n, 1n, '0x'], 2, /AccessControlUnauthorizedAccount/);
  await reject(collection, 'mintBatch', [accounts[2], [7n, 7n], [3n, 3n], '0x'], 1, /LifetimeCapExceeded/);
  assert.equal(await read(collection, 'mintedEver', [7n]), 0n);
  await reject(collection, 'mint', [accounts[2], 9n, 1n, '0x'], 1, /LifetimeCapExceeded/);
  await reject(collection, 'mint', [accounts[2], 7n, 0n, '0x'], 1, /LifetimeCapExceeded/);
  await reject(collection, 'mintBatch', [accounts[2], [7n], [], '0x'], 1, /InvalidBatch/);
  await send(collection, 'mintBatch', [accounts[2], [7n, 7n, 8n], [2n, 1n, 2n], '0x'], 1);
  assert.equal(await read(collection, 'balanceOf', [accounts[2], 7n]), 3n);
  assert.equal(await read(collection, 'totalSupply', [7n]), 3n);
  await reject(collection, 'safeTransferFrom', [accounts[2], accounts[3], 7n, 1n, '0x'], 3, /ERC1155MissingApprovalForAll/);
  await send(collection, 'setApprovalForAll', [accounts[3], true], 2);
  await send(collection, 'safeBatchTransferFrom', [accounts[2], accounts[3], [7n, 8n], [2n, 1n], '0x'], 3);
  assert.equal(await read(collection, 'balanceOf', [accounts[2], 7n]), 1n);
  assert.equal(await read(collection, 'balanceOf', [accounts[3], 7n]), 2n);
  await reject(collection, 'safeTransferFrom', [accounts[2], accounts[3], 7n, 2n, '0x'], 3, /ERC1155InsufficientBalance/);
  await send(collection, 'burn', [7n, 1n], 2);
  assert.equal(await read(collection, 'totalSupply', [7n]), 2n);
  assert.equal(await read(collection, 'mintedEver', [7n]), 3n);
  await send(collection, 'mint', [accounts[2], 7n, 2n, '0x'], 1);
  await reject(collection, 'mint', [accounts[2], 7n, 1n, '0x'], 1, /LifetimeCapExceeded/);
  await send(collection, 'setApprovalForAll', [accounts[3], false], 2);
  await reject(collection, 'safeTransferFrom', [accounts[2], accounts[3], 7n, 1n, '0x'], 3, /ERC1155MissingApprovalForAll/);
  const probe = await deploy(probes.ContractProbe);
  await send(collection, 'grantRole', [await read(collection, 'MINTER_ROLE'), probe.address]);
  await send(probe, 'configure', [zero, '0x', true, false]);
  await reject(collection, 'mint', [probe.address, 8n, 1n, '0x'], 1, /test receiver rejects delivery/);
  assert.equal(await read(collection, 'mintedEver', [8n]), 2n);
  assert.equal(await read(collection, 'totalSupply', [8n]), 2n);
  await send(probe, 'configure', [collection.address, encode(collection, 'mint', [probe.address, 8n, 1n, '0x']), false, false]);
  await send(collection, 'mint', [probe.address, 8n, 1n, '0x'], 1);
  assert.equal(await read(probe, 'reentryAttempted'), true);
  assert.equal(await read(probe, 'reentrySucceeded'), false);
  await send(probe, 'configure', [zero, '0x', true, false]);
  await reject(collection, 'safeTransferFrom', [accounts[3], probe.address, 8n, 1n, '0x'], 3, /test receiver rejects delivery/);
  assert.equal(await read(collection, 'balanceOf', [accounts[3], 8n]), 1n);
  assert.equal((await read(collection, 'royaltyInfo', [7n, 10000n]))[1], 500n);
  assert.equal(await read(collection, 'supportsInterface', ['0x2a55205a']), true);
}));

test('optional operator profile rejects unlisted contracts, delisting and unavailable registry while permitting revocation', { timeout: 60000 }, () => withChain(async context => {
  const { accounts } = context;
  const { read, send, reject, deploy, deploy721, deploy1155 } = tools(context);
  const registry = await deploy(probes.SyntheticOperatorRegistry);
  const operator = await deploy(probes.ContractProbe);
  const nft = await deploy721(2n, registry.address);
  const units = await deploy1155(registry.address);
  await send(nft, 'mint', [accounts[2]], 1);
  await send(units, 'mint', [accounts[2], 7n, 3n, '0x'], 1);
  await reject(nft, 'approve', [operator.address, 1n], 2, /RestrictedOperator/);
  await reject(units, 'setApprovalForAll', [operator.address, true], 2, /RestrictedOperator/);
  await reject(nft, 'safeTransferFrom', [accounts[2], operator.address, 1n], 2, /RestrictedOperator/);
  await reject(units, 'safeTransferFrom', [accounts[2], operator.address, 7n, 1n, '0x'], 2, /RestrictedOperator/);
  await send(registry, 'setAllowed', [operator.address, true]);
  await send(nft, 'approve', [operator.address, 1n], 2);
  await send(units, 'setApprovalForAll', [operator.address, true], 2);
  await send(registry, 'setAllowed', [operator.address, false]);
  await reject(operator, 'execute', [nft.address, encode(nft, 'transferFrom', [accounts[2], accounts[3], 1n])], 0, /revert/i);
  await reject(operator, 'execute', [units.address, encode(units, 'safeTransferFrom', [accounts[2], accounts[3], 7n, 1n, '0x'])], 0, /revert/i);
  eqAddress(await read(nft, 'ownerOf', [1n]), accounts[2]);
  assert.equal(await read(units, 'balanceOf', [accounts[2], 7n]), 3n);
  await send(registry, 'setUnavailable', [true]);
  await send(nft, 'approve', [zero, 1n], 2);
  await send(units, 'setApprovalForAll', [operator.address, false], 2);
  await reject(nft, 'approve', [operator.address, 1n], 2, /test registry unavailable/);
  await send(registry, 'setUnavailable', [false]);
  await send(registry, 'setAllowed', [operator.address, true]);
  await send(nft, 'approve', [operator.address, 1n], 2);
  await send(operator, 'execute', [nft.address, encode(nft, 'transferFrom', [accounts[2], accounts[3], 1n])]);
  eqAddress(await read(nft, 'ownerOf', [1n]), accounts[3]);
}));

test('test-only sale proves transfer and payment rollback in one local EVM transaction', { timeout: 60000 }, () => withChain(async context => {
  const { publicClient, accounts } = context;
  const { read, send, reject, deploy, deploy721 } = tools(context);
  const collection = await deploy721(1n);
  const seller = await deploy(probes.ContractProbe);
  const deployedSale = await deploy(probes.TestOnlyAtomicSale);
  const sale = { ...deployedSale, abi: [...deployedSale.abi, ...c721.abi.filter(item => item.type === 'error')] };
  await send(collection, 'mint', [seller.address], 1);
  await send(seller, 'execute', [collection.address, encode(collection, 'approve', [sale.address, 1n])]);
  await send(seller, 'configure', [zero, '0x', false, true]);
  await reject(sale, 'buy721', [collection.address, seller.address, 1n], 2, /test payment failed/, 100n);
  eqAddress(await read(collection, 'ownerOf', [1n]), seller.address);
  eqAddress(await read(collection, 'getApproved', [1n]), sale.address);
  assert.equal(await publicClient.getBalance({ address: sale.address }), 0n);
  assert.equal(await publicClient.getBalance({ address: seller.address }), 0n);
  await send(seller, 'configure', [zero, '0x', false, false]);
  await send(sale, 'buy721', [collection.address, seller.address, 1n], 2, 100n);
  eqAddress(await read(collection, 'ownerOf', [1n]), accounts[2]);
  assert.equal(await publicClient.getBalance({ address: seller.address }), 100n);
  await reject(sale, 'buy721', [collection.address, seller.address, 1n], 2, /ERC721InsufficientApproval/, 100n);
}));
