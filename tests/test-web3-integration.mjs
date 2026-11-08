import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { createWalletSession, createSiweAuthenticator } from '../.web3/runtime/wallet-session.mjs';
import { createOwnershipReader, createMemoryReservationManager } from '../.web3/runtime/ownership.mjs';
import { createMemoryTradeCoordinator } from '../.web3/runtime/trading.mjs';
import { compile, withChain, viem, solc } from './lib/web3-fixture.mjs';
import policyTools from '../commands/lib/web3-game.cjs';

const require = createRequire(new URL('./fixtures/web3/package.json', import.meta.url));
const { createSiweMessage, parseSiweMessage, generateSiweNonce } = require('viem/siwe');
const { validateSpec } = policyTools;
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/web3/package.json', import.meta.url), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const lockSha256 = sha256(fs.readFileSync(new URL('./fixtures/web3/package-lock.json', import.meta.url)));
const files = ['OperatorPolicy.sol', 'GameItems721.sol', 'GameItems1155.sol', 'test/ContractProbe.sol'];
const sources = Object.fromEntries(files.map(name => [name,
  fs.readFileSync(new URL('../.web3/contracts/' + name, import.meta.url), 'utf8')]));
const compiled = compile(sources);
const nftArtifact = compiled['GameItems721.sol'].GameItems721;
const unitArtifact = compiled['GameItems1155.sol'].GameItems1155;
const testArtifacts = compiled['test/ContractProbe.sol'];
const origin = 'https://tcg.example', uri = origin + '/login';
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
const nowSeconds = () => Math.floor(Date.now() / 1000);

// A local EIP1193-shaped transport around known unlocked genesis accounts. It
// signs against real Anvil; this is neither an injected browser nor native QA.
async function authenticate(context, selected) {
  const { accounts, publicClient, chain } = context;
  assert.ok(accounts.some(account => same(account, selected)));
  const provider = new EventEmitter();
  provider.request = async ({ method, params }) => {
    if (['eth_accounts', 'eth_requestAccounts'].includes(method)) return [selected];
    if (['eth_chainId', 'personal_sign'].includes(method)) return publicClient.request({ method, params });
    throw new Error('Unexpected local provider method');
  };
  const records = new Map(), sessionId = `localTcgSession${chain.id}${selected.slice(2, 12)}`;
  const auth = createSiweAuthenticator({ origin, uri, chainId: chain.id,
    generateNonce: generateSiweNonce, createMessage: createSiweMessage, parseMessage: parseSiweMessage,
    nonceStore: {
      put({ nonce, record }) { if (records.has(nonce)) return false; records.set(nonce, record); return true; },
      take({ nonce }) { const record = records.get(nonce); records.delete(nonce); return record; },
    },
    resolveAccount: async ({ address, chainId }) => {
      assert.equal(chainId, await publicClient.getChainId());
      assert.ok(same(address, selected));
      const code = await publicClient.getCode({ address });
      assert.ok(!code || code === '0x');
      // This fixture knows these undelegated genesis accounts. Code absence
      // alone is not a general production account/delegation classifier.
      return { kind: 'eoa', authorityId: `known-local-genesis:${chainId}:${address}` };
    },
    verifiers: { eoa: ({ address, message, signature }) => viem.verifyMessage({ address, message, signature }) },
  });
  const session = createWalletSession({ provider, chainId: chain.id, origin, uri,
    createMessage: createSiweMessage, parseMessage: parseSiweMessage });
  try {
    const connection = await session.connect();
    assert.equal(connection.status, 'connected');
    const challenge = await auth.issueChallenge({ address: selected, sessionId, requestOrigin: origin });
    assert.equal(parseSiweMessage(challenge.message).chainId, chain.id);
    const signature = await session.signChallenge({ challenge });
    const result = await auth.verifyChallenge({ message: challenge.message, signature, sessionId, requestOrigin: origin });
    assert.equal(result.status, 'authenticated');
    assert.equal(result.address, selected.toLowerCase());
    assert.equal('ownership' in result, false);
    await assert.rejects(auth.verifyChallenge({ message: challenge.message, signature, sessionId, requestOrigin: origin }),
      error => error.code === 'nonce-missing-or-used');
    assert.equal(records.size, 0);
    return result;
  } finally {
    session.dispose();
    assert.equal(provider.eventNames().length, 0);
  }
}

for (const [chainId, chainName] of [[1, 'ETHEREUM'], [8453, 'BASE'], [13371, 'IMMUTABLE']]) {
  test(`TCG lifecycle on LOCAL Anvil chainId ${chainId}: auth, quantity admission, atomic diagnostic sale and reorg`,
    { timeout: 60000 }, async t => withChain(async context => {
      const { publicClient, wallets, accounts, url } = context;
      assert.equal(new URL(url).hostname, '127.0.0.1');
      assert.equal(await publicClient.getChainId(), chainId);
      const [admin, minter, seller, buyer] = accounts;
      const read = (contract, functionName, args = [], extra = {}) => publicClient.readContract({ ...contract, functionName, args, ...extra });
      async function send(contract, functionName, args = [], actor = 0) {
        const transactionHash = await wallets[actor].writeContract({ ...contract, functionName, args });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
        assert.equal(receipt.status, 'success'); return receipt;
      }
      async function deploy(artifact, args = []) {
        const hash = await wallets[0].deployContract({ ...artifact, args });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        assert.equal(receipt.status, 'success');
        return { address: receipt.contractAddress, abi: artifact.abi, deploymentBlock: receipt.blockNumber.toString() };
      }

      // The Immutable-labeled context tests an interface-compatible SYNTHETIC
      // registry. No managed registry identity/operator approval is established.
      const registry = chainId === 13371 ? await deploy(testArtifacts.SyntheticOperatorRegistry) : null;
      const registryAddress = registry?.address ?? viem.zeroAddress;
      const nft = await deploy(nftArtifact, ['Local TCG serials', 'LTCS', 'ipfs://reviewed/', admin, minter, 5n, admin, 500, registryAddress]);
      const units = await deploy(unitArtifact, ['ipfs://reviewed/{id}.json', admin, minter, [7n], [10n], admin, 500, registryAddress]);
      const sale = await deploy(testArtifacts.TestOnlyAtomicSale);
      if (registry) await send(registry, 'setAllowed', [sale.address, true]);
      await send(nft, 'mint', [seller], 1);
      await send(units, 'mint', [seller, 7n, 3n, '0x'], 1);
      const nftCodeHash = viem.keccak256(await publicClient.getCode({ address: nft.address }));
      const unitsCodeHash = viem.keccak256(await publicClient.getCode({ address: units.address }));
      const saleCodeHash = viem.keccak256(await publicClient.getCode({ address: sale.address }));
      const operatorPolicy = registry ? 'immutable-allowlist' : 'standard';
      const policy = validateSpec({ schemaVersion: 'hephaera-web3/v1', chains: [chainName], origin,
        matchPolicy: 'snapshot-license', ownership: { maxAgeSeconds: 120, blockTag: 'latest', rpcEnvironment: { [chainName]: 'LOCAL_TEST_RPC' } },
        walletKinds: ['eoa'], collections: [
          { key: 'serials', chain: chainName, address: nft.address, standard: 'ERC721', deploymentBlock: nft.deploymentBlock, runtimeCodeHash: nftCodeHash, operatorPolicy },
          { key: 'editions', chain: chainName, address: units.address, standard: 'ERC1155', deploymentBlock: units.deploymentBlock, runtimeCodeHash: unitsCodeHash, operatorPolicy },
        ], services: [], distribution: { channel: 'web', nftUnlocksGameplay: true } });
      const sellerLogin = await authenticate(context, seller), buyerLogin = await authenticate(context, buyer);
      assert.equal(sellerLogin.chainId, chainId); assert.equal(buyerLogin.chainId, chainId);
      const serial = { chainId: String(chainId), contractAddress: nft.address.toLowerCase(), tokenId: '1', standard: 'ERC721', quantity: '1' };
      const edition = { chainId: String(chainId), contractAddress: units.address.toLowerCase(), tokenId: '7', standard: 'ERC1155', quantity: '2' };
      const collections = policy.collections.map(item => ({ chainId: String(chainId), contractAddress: item.address,
        standard: item.standard, runtimeCodeHash: item.runtimeCodeHash }));
      const reader = createOwnershipReader({ client: publicClient, hashCode: viem.keccak256, collections,
        policy: { blockTag: policy.ownership.blockTag, maxAgeSeconds: policy.ownership.maxAgeSeconds }, nowSeconds });
      const initial = await reader.read({ asset: edition, owner: sellerLogin.address });
      assert.equal(initial.status, 'verified'); assert.equal(initial.balance, '3');
      assert.equal(initial.cryptographicStorageProof, false);
      const matches = createMemoryReservationManager({ reader, policy: policy.matchPolicy, buyerOverlap: 'allowed', maxMatchSeconds: 180, nowSeconds });
      const sellerMatch = await matches.admit({ matchId: 'seller-active-match', owner: sellerLogin.address,
        assets: [serial, edition], expiresAt: nowSeconds() + 150 });
      assert.equal(sellerMatch.status, 'admitted');
      assert.equal(sellerMatch.reservation.evidence.length, 2);
      const overcommitted = await matches.admit({ matchId: 'seller-excess-units', owner: sellerLogin.address,
        assets: [{ ...edition, quantity: '2' }], expiresAt: nowSeconds() + 150 });
      assert.equal(overcommitted.status, 'rejected'); assert.equal(overcommitted.reason, 'insufficient-unreserved-quantity');

      const wrongCode = createOwnershipReader({ client: publicClient, hashCode: viem.keccak256,
        collections: [{ ...collections.find(item => item.standard === 'ERC721'), runtimeCodeHash: viem.keccak256('0xdeadbeef') }],
        policy: { blockTag: 'latest', maxAgeSeconds: 120 }, nowSeconds });
      assert.equal((await wrongCode.read({ asset: serial, owner: seller })).reason, 'runtime-code-changed');
      const otherChain = chainId === 1 ? '8453' : '1';
      const wrongChain = createOwnershipReader({ client: publicClient, hashCode: viem.keccak256,
        collections: [{ ...collections.find(item => item.standard === 'ERC721'), chainId: otherChain }],
        policy: { blockTag: 'latest', maxAgeSeconds: 120 }, nowSeconds });
      assert.equal((await wrongChain.read({ asset: { ...serial, chainId: otherChain }, owner: seller })).reason, 'wrong-chain');

      // TEST ONLY. The selected diagnostic harness has no production price,
      // order signature/nonces, fees, royalty payment or exchange protection.
      // Adapter checks below verify this closed fixture's real transfer/payment.
      const amount = '1000000000000';
      const intent = { chainId: String(chainId), settlement: { adapterId: 'test-only-atomic-sale', version: '1', address: sale.address, runtimeCodeHash: saleCodeHash },
        maker: sellerLogin.address, taker: buyerLogin.address, asset: serial,
        payment: { tokenAddress: viem.zeroAddress, amount, decimals: 18 }, fees: [], expiresAt: nowSeconds() + 150, nonce: '1' };
      const adapter = {
        id: 'test-only-atomic-sale', version: '1',
        async prepare({ intent: selected }) {
          assert.equal(selected.asset.standard, 'ERC721'); assert.equal(selected.asset.quantity, '1');
          assert.equal(selected.payment.tokenAddress, viem.zeroAddress); assert.equal(selected.fees.length, 0);
          return { orderKey: viem.keccak256(viem.toHex(JSON.stringify(selected))), request: { chainId: selected.chainId,
            to: sale.address, data: viem.encodeFunctionData({ abi: sale.abi, functionName: 'buy721', args: [nft.address, selected.maker, 1n] }), value: selected.payment.amount } };
        },
        async inspect({ intent: selected }) {
          const block = await publicClient.getBlock({ blockTag: 'latest' }), at = { blockNumber: block.number };
          if (!same(await read(nft, 'ownerOf', [1n], at), selected.maker)) return { status: 'filled' };
          const approved = await read(nft, 'getApproved', [1n], at);
          if (!same(approved, sale.address) && !await read(nft, 'isApprovedForAll', [selected.maker, sale.address], at)) return { status: 'stale-approval' };
          await publicClient.simulateContract({ ...sale, functionName: 'buy721', args: [nft.address, selected.maker, 1n],
            account: selected.taker, value: BigInt(selected.payment.amount), blockNumber: block.number });
          return { status: 'executable', remainingQuantity: '1', checkedAt: nowSeconds(),
            block: { number: block.number.toString(), hash: block.hash }, runtimeCodeHash: saleCodeHash };
        },
        async interpretReceipt({ intent: selected, receipt }) {
          const transfers = viem.parseEventLogs({ abi: nft.abi, logs: receipt.logs, eventName: 'Transfer' })
            .filter(log => same(log.address, nft.address) && same(log.args.from, selected.maker) && same(log.args.to, selected.taker) && log.args.tokenId === 1n);
          const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
          // Anvil automines one transaction per block here, so this difference
          // isolates actual native payment to the seller, who pays no sale gas.
          assert.equal(block.transactions.length, 1); assert.equal(block.transactions[0], receipt.transactionHash);
          const before = await publicClient.getBalance({ address: selected.maker, blockNumber: receipt.blockNumber - 1n });
          const after = await publicClient.getBalance({ address: selected.maker, blockNumber: receipt.blockNumber });
          return transfers.length === 1 && after - before === BigInt(selected.payment.amount)
            ? { status: 'settled', quantity: '1' } : { status: 'unrelated' };
        },
      };
      const trading = createMemoryTradeCoordinator({ adapter, client: publicClient, hashCode: viem.keccak256,
        nowSeconds, blockTag: 'latest', maxStateAgeSeconds: 120 });
      await send(nft, 'approve', [sale.address, 1n], 2);
      assert.equal((await trading.prepare({ operationId: 'buy-local-card', intent })).operation.status, 'prepared');
      await send(nft, 'approve', [viem.zeroAddress, 1n], 2);
      const revoked = await trading.beginSubmission('buy-local-card');
      assert.equal(revoked.allowed, false); assert.equal(revoked.reason, 'stale-approval');
      await send(nft, 'approve', [sale.address, 1n], 2);
      assert.equal((await trading.refresh('buy-local-card')).operation.status, 'prepared');
      const checkpoint = await publicClient.request({ method: 'evm_snapshot' });
      const submission = await trading.beginSubmission('buy-local-card'); assert.equal(submission.allowed, true);
      const nonce = await publicClient.getTransactionCount({ address: buyer });
      const transactionHash = await wallets[3].sendTransaction({ to: submission.request.to, data: submission.request.data, value: BigInt(submission.request.value) });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash }); assert.equal(receipt.status, 'success');
      await trading.recordSubmitted('buy-local-card', { transactionHash, sender: buyer, nonce: String(nonce) });
      const settled = await trading.reconcile('buy-local-card');
      assert.equal(settled.status, 'confirmed'); assert.equal(settled.settlement.finalityTag, 'latest');
      assert.equal(settled.settlement.cryptographicStorageProof, false);
      const sellerAfterSale = await reader.read({ asset: serial, owner: sellerLogin.address });
      assert.equal(sellerAfterSale.status, 'verified'); assert.equal(sellerAfterSale.balance, '0');
      assert.equal((await reader.read({ asset: serial, owner: buyerLogin.address })).balance, '1');
      assert.equal((await matches.admit({ matchId: 'seller-new-match', owner: sellerLogin.address,
        assets: [serial], expiresAt: nowSeconds() + 150 })).status, 'rejected');
      assert.equal((await matches.admit({ matchId: 'buyer-new-match', owner: buyerLogin.address,
        assets: [serial], expiresAt: nowSeconds() + 150 })).status, 'admitted');
      const retainedSeller = (await matches.inspect()).find(item => item.matchId === 'seller-active-match');
      assert.deepEqual(retainedSeller, sellerMatch.reservation, 'the explicitly approved bounded snapshot survives external sale');
      assert.equal((await trading.beginSubmission('buy-local-card')).allowed, false);

      // Real local state rollback and a different canonical transaction remove
      // the sale. In-memory admission is a snapshot license, not a chain lock.
      assert.equal(await publicClient.request({ method: 'evm_revert', params: [checkpoint] }), true);
      await send(nft, 'approve', [viem.zeroAddress, 1n], 2);
      const orphaned = await trading.reconcile('buy-local-card');
      assert.ok(['unknown', 'orphaned'].includes(orphaned.status)); assert.equal(orphaned.settlement, undefined);
      assert.equal((await reader.read({ asset: serial, owner: sellerLogin.address })).balance, '1');
      assert.equal((await reader.read({ asset: serial, owner: buyerLogin.address })).balance, '0');
      // The game explicitly releases the buyer's snapshot for this fixture's
      // reorg policy; no automatic chain lock/recovery is claimed by the helper.
      assert.equal((await matches.release('buyer-new-match')).released, true);
      assert.ok((await matches.inspect()).some(item => item.matchId === 'seller-active-match'));
      t.diagnostic(JSON.stringify({ evidence: 'local-loopback-Anvil-only', labeledChainId: String(chainId),
        compiler: solc.version(), evmVersion: 'cancun', optimizerRuns: 200, dependencies: fixture.dependencies, lockSha256,
        sourceSha256: Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, sha256(source)])),
        policySha256: sha256(JSON.stringify(policy)), runtimeCodeHashes: { serials: nftCodeHash, editions: unitsCodeHash, testOnlySale: saleCodeHash },
        authentication: 'actual SDK SIWE and local unlocked EOA signatures', trade: 'test-only atomic sale; actual transfer and native payment',
        immutableOperator: registry ? 'synthetic registry only; managed identity and approval unverified' : 'not-selected',
        services: 'none', publicChain: 'not-run', productionProtocol: 'not-implemented', realFinality: 'unverified', browserNativeDevice: 'not-run' }));
    }, { chainId }));
}
