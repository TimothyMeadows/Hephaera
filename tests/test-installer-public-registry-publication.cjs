'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { writeZip, readZip } = require('../installer/scripts/archives.cjs');
const { digest } = require('../installer/core/files.cjs');
const { inspectPublic, publishPublic, equivalentNuget } = require('../installer/lib/public-publish.cjs');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const sri = x => 'sha512-' + crypto.createHash('sha512').update(x).digest('base64');
function tar(entries) {
  const parts = [];
  for (const [name, bytes] of entries) {
    const header = Buffer.alloc(512); header.write(name); header.write('0000644\0', 100); header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124); header.fill(32, 148, 156); header[156] = 48;
    header.write(header.reduce((a, b) => a + b, 0).toString(8).padStart(6, '0') + '\0 ', 148); parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return zlib.gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}
function fixture(version = '5.1.0-rc.1') {
  const directory = path.resolve(__dirname, '../.local/public-registry-tests', crypto.randomUUID()); fs.mkdirSync(path.join(directory, 'artifacts'), { recursive: true });
  const code = Buffer.from("'use strict'; // owned test core\n"), coreFiles = { 'cli.cjs': hash(code), 'manifest.cjs': hash(code) };
  const manifest = { schemaVersion: 1, version, repository: 'https://github.com/TimothyMeadows/Hephaera.git', revision: 'a'.repeat(40), tree: 'b'.repeat(40), tag: version, sourceDirty: false, bubo: JSON.parse(fs.readFileSync(path.resolve(__dirname, '../runtime/bubo.lock.json'))), coreFiles };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  const npm = tar(new Map([['package/package.json', Buffer.from(JSON.stringify({ name: '@timothymeadows/hephaera', version, publishConfig: { registry: 'https://npm.pkg.github.com' } }))], ['package/core/release-manifest.json', manifestBytes], ...Object.keys(coreFiles).map(x => ['package/core/' + x, code])]));
  const nugetEntries = new Map([['Hephaera.nuspec', Buffer.from('<package><metadata><id>Hephaera</id><version>' + version + '</version></metadata></package>')], ['tools/net10.0/any/core/release-manifest.json', manifestBytes], ...Object.keys(coreFiles).map(x => ['tools/net10.0/any/core/' + x, code])]);
  const nuget = writeZip(nugetEntries), receipt = { schemaVersion: 1, version, sourceDirty: false, manifest, manifestSha256: digest(manifest), manifestFileSha256: hash(manifestBytes), artifacts: {} };
  for (const [channel, bytes] of [['npm', npm], ['nuget', nuget]]) { const file = 'artifacts/' + channel + (channel === 'npm' ? '.tgz' : '.nupkg'); fs.writeFileSync(path.join(directory, file), bytes); receipt.artifacts[channel] = { file, sha256: hash(bytes) }; }
  fs.writeFileSync(path.join(directory, 'package-build.json'), JSON.stringify(receipt));
  const signed = writeZip(new Map([...nugetEntries, ['.signature.p7s', Buffer.from('owned boundary signature fixture; not cryptographic evidence')]]));
  return { directory, receipt, manifest, npm, nuget, signed, options: { expectedManifest: manifest } };
}
function observed(f, channel) {
  return channel === 'npm' ? { originalSha256: hash(f.npm), servedSha256: hash(f.npm), integrity: sri(f.npm) } : { originalSha256: hash(f.nuget), servedSha256: hash(f.signed), payloadEquivalent: true, verification: { verified: true, repository: 'https://api.nuget.org/v3/index.json' } };
}
function journal(f) { return JSON.parse(fs.readFileSync(path.join(f.directory, 'public-publication.json'))); }

test('public dry-run is pure, requires admitted identity, and validates selection', async () => {
  const f = fixture(); let calls = 0;
  const io = { lookup: () => calls++, auth: () => calls++, upload: () => calls++ };
  const result = await publishPublic(f.directory, { ...f.options, channels: ['nuget'], io });
  assert.equal(result.status, 'dry-run'); assert.equal(result.requiresInspection, true); assert.equal(result.channels.nuget.status, 'not-inspected'); assert.equal(calls, 0); assert.equal(fs.existsSync(path.join(f.directory, 'public-publication.json')), false);
  await assert.rejects(inspectPublic(f.directory), /explicit admitted/);
  for (const channels of [[], ['npm', 'npm'], ['github'], 'nuget']) await assert.rejects(inspectPublic(f.directory, { ...f.options, channels }), /distinct/);
});

test('read-only selected inspection needs no unrelated auth and creates no journal', async () => {
  const f = fixture(), reads = [];
  const result = await inspectPublic(f.directory, { ...f.options, channels: ['nuget'], io: { lookup: async channel => { reads.push(channel); return observed(f, channel); }, auth: () => assert.fail('inspection has no auth') } });
  assert.deepEqual(reads, ['nuget']); assert.equal(result.selectedComplete, true); assert.equal(result.bothPublicReady, false); assert.equal(result.channels.npm.status, 'not-selected'); assert.equal(result.channels.npm.selected, false);
  assert.equal(fs.existsSync(path.join(f.directory, 'public-publication.json')), false);
});

test('all selected reads and auth prerequisites precede any upload', async () => {
  const f = fixture(), calls = [];
  const io = { lookup: async x => { calls.push('read:' + x); return null; }, auth: async x => { calls.push('auth:' + x); return x !== 'nuget'; }, upload: async () => assert.fail('blocked auth cannot upload') };
  await assert.rejects(publishPublic(f.directory, { ...f.options, execute: true, io }), /authentication/);
  assert.deepEqual(calls, ['read:npm', 'read:nuget', 'auth:npm', 'auth:nuget']); assert.equal(journal(f).history[0].event, 'started'); assert.equal(journal(f).channels.npm.attempts, 0); assert.equal(journal(f).channels.nuget.attempts, 0);
  calls.length = 0;
  io.lookup = async x => { calls.push('read:' + x); return x === 'npm' ? null : { ...observed(f, x), originalSha256: '0'.repeat(64) }; };
  await assert.rejects(publishPublic(f.directory, { ...f.options, execute: true, io }), /readback failed or differs/); assert.deepEqual(calls, ['read:npm', 'read:nuget']);
});

test('independent selections retain channel evidence and append history without marking unselected ready', async () => {
  const f = fixture(), remote = { npm: false, nuget: false }, uploads = [];
  const io = { lookup: async x => remote[x] ? observed(f, x) : null, auth: async () => true, upload: async x => { uploads.push(x); remote[x] = true; return { accepted: true }; }, sleep: async () => {} };
  const first = await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io });
  assert.equal(first.selectedComplete, true); assert.equal(first.bothPublicReady, false); const before = journal(f);
  const second = await publishPublic(f.directory, { ...f.options, channels: ['npm'], execute: true, io });
  assert.equal(second.selectedComplete, true); assert.equal(second.bothPublicReady, true); assert.equal(second.channels.nuget.selected, false); assert.equal(second.channels.nuget.servedSha256, hash(f.signed));
  assert.deepEqual(journal(f).history.slice(0, before.history.length), before.history); assert.deepEqual(uploads, ['nuget', 'npm']);
  await publishPublic(f.directory, { ...f.options, execute: true, io: { ...io, auth: async () => assert.fail('existing versions need no credentials') } }); assert.deepEqual(uploads, ['nuget', 'npm']);
});

test('uncertain writes and accepted indexing delays cannot be blindly resubmitted', async () => {
  const f = fixture(); let uploads = 0, visible = false;
  const io = { lookup: async () => visible ? observed(f, 'nuget') : null, auth: async () => true, upload: async () => { uploads++; throw new Error('opaque boundary error'); }, sleep: async () => {} };
  const first = await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io }); assert.equal(first.status, 'needs-reconciliation'); assert.equal(first.channels.nuget.status, 'uncertain');
  const bytes = fs.readFileSync(path.join(f.directory, 'public-publication.json'));
  const retry = await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io }); assert.equal(retry.status, 'needs-reconciliation'); assert.deepEqual(retry.blockedChannels, ['nuget']); assert.equal(uploads, 1); assert.deepEqual(journal(f).history.slice(0, JSON.parse(bytes).history.length), JSON.parse(bytes).history); assert.equal(journal(f).channels.nuget.attempts, 1);
  visible = true; const reconciled = await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io }); assert.equal(reconciled.selectedComplete, true); assert.equal(uploads, 1);
  const g = fixture(); let reads = 0, sleeps = 0, accepted = 0;
  const pendingIo = { lookup: async () => { reads++; return null; }, auth: async () => true, upload: async () => { accepted++; return { accepted: true }; }, sleep: async ms => { assert.equal(ms, 30000); sleeps++; } };
  const pending = await publishPublic(g.directory, { ...g.options, channels: ['nuget'], execute: true, io: pendingIo }); assert.equal(pending.status, 'pending'); assert.equal(reads, 32); assert.equal(sleeps, 30); assert.equal(accepted, 1);
  await publishPublic(g.directory, { ...g.options, channels: ['nuget'], execute: true, io: pendingIo }); assert.equal(accepted, 1); assert.equal(journal(g).channels.nuget.attempts, 1);
});

test('journal identity, unknown states and active ownership fail closed', async () => {
  const f = fixture(), io = { lookup: async x => observed(f, x), auth: async () => assert.fail(), upload: async () => assert.fail() };
  await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io }); const original = fs.readFileSync(path.join(f.directory, 'public-publication.json'));
  for (const change of [x => x.channels.nuget.status = 'pending_typo', x => x.channels.nuget.attempts = -1, x => x.channels.nuget.attempts = '1', x => { x.channels.nuget.status = 'absent'; x.channels.nuget.attempts = 1; }, x => x.identity.version = 'other']) {
    const bad = JSON.parse(original); change(bad); fs.writeFileSync(path.join(f.directory, 'public-publication.json'), JSON.stringify(bad));
    const before = fs.readFileSync(path.join(f.directory, 'public-publication.json'));
    await assert.rejects(publishPublic(f.directory, { ...f.options, execute: true, io }), /journal|history/); assert.deepEqual(fs.readFileSync(path.join(f.directory, 'public-publication.json')), before);
  }
  fs.writeFileSync(path.join(f.directory, 'public-publication.json'), original); fs.writeFileSync(path.join(f.directory, 'public-publication.lock'), 'another-owner');
  await assert.rejects(publishPublic(f.directory, { ...f.options, execute: true, io }), /already owned/); assert.equal(fs.readFileSync(path.join(f.directory, 'public-publication.lock'), 'utf8'), 'another-owner');
});

test('execution reads the latest journal after ownership acquisition, retaining a concurrent uncertain write', async t => {
  const f = fixture(), io = { lookup: async () => null, auth: async () => true, upload: async () => { throw new Error('owned uncertain boundary'); }, sleep: async () => {} };
  await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io });
  const file = path.join(f.directory, 'public-publication.json'), latest = fs.readFileSync(file), lock = path.join(f.directory, 'public-publication.lock'); fs.unlinkSync(file);
  const open = fs.openSync;
  t.mock.method(fs, 'openSync', (name, ...args) => { if (name === lock) fs.writeFileSync(file, latest); return open(name, ...args); });
  let uploads = 0;
  const result = await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io: { ...io, upload: async () => { uploads++; return { accepted: true }; } } });
  assert.equal(result.status, 'needs-reconciliation'); assert.equal(uploads, 0); assert.deepEqual(journal(f).history.slice(0, JSON.parse(latest).history.length), JSON.parse(latest).history); assert.equal(journal(f).channels.nuget.attempts, 1);
});

test('initial lookup or auth failure preserves zero-write history and restored safe recovery', async () => {
  for (const phase of ['lookup', 'auth']) {
    const f = fixture(); let writes = 0;
    const io = { lookup: async () => { if (phase === 'lookup') throw new Error('owned unavailable read'); return null; }, auth: async () => { throw new Error('owned missing auth'); }, upload: async () => { writes++; return { accepted: true }; } };
    await assert.rejects(publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io }));
    const before = journal(f); assert.equal(before.history[0].event, 'started'); assert.equal(before.channels.nuget.status, 'not-inspected'); assert.equal(before.channels.nuget.attempts, 0); assert.equal(writes, 0); assert.equal(before.history.some(x => x.event === 'write-intent'), false);
    const restored = fixture(); fs.writeFileSync(path.join(restored.directory, 'public-publication.json'), JSON.stringify(before)); let visible = false;
    const result = await publishPublic(restored.directory, { ...restored.options, channels: ['nuget'], execute: true, io: { lookup: async () => visible ? observed(restored, 'nuget') : null, auth: async () => true, upload: async () => { writes++; visible = true; return { accepted: true }; }, sleep: async () => {} } });
    assert.equal(result.selectedComplete, true); assert.equal(writes, 1); assert.equal(journal(restored).channels.nuget.attempts, 1); assert.deepEqual(journal(restored).history.slice(0, before.history.length), before.history);
  }
});

test('retained write intent cannot lose its channel state or name and permit another upload', async () => {
  const f = fixture(); let uploads = 0;
  const io = { lookup: async () => null, auth: async () => true, upload: async () => { uploads++; throw new Error('owned uncertain write'); }, sleep: async () => {} };
  await publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io }); const original = journal(f);
  assert.equal(original.channels.nuget.attempts, 1);
  for (const change of [x => delete x.channels.nuget, x => x.history.find(event => event.event === 'write-intent').channel = 'unknown']) {
    const bad = structuredClone(original); change(bad); const before = Buffer.from(JSON.stringify(bad)); fs.writeFileSync(path.join(f.directory, 'public-publication.json'), before);
    await assert.rejects(publishPublic(f.directory, { ...f.options, channels: ['nuget'], execute: true, io }), /history/); assert.equal(uploads, 1); assert.deepEqual(fs.readFileSync(path.join(f.directory, 'public-publication.json')), before);
  }
});

test('signed NuGet equivalence rejects changed bytes, aliases, links and non-root signatures', () => {
  const f = fixture(); assert.equal(equivalentNuget(f.nuget, f.signed).payloadEquivalent, true); assert.notEqual(hash(f.nuget), hash(f.signed));
  const changed = readZip(f.signed); changed.set('Hephaera.nuspec', Buffer.from('changed')); assert.throws(() => equivalentNuget(f.nuget, writeZip(changed)), /payload differs/);
  const extra = readZip(f.signed); extra.set('unexpected', Buffer.from('x')); assert.throws(() => equivalentNuget(f.nuget, writeZip(extra)), /envelope differs/);
  const alias = readZip(f.signed); alias.set('hephaera.nuspec', alias.get('Hephaera.nuspec')); assert.throws(() => equivalentNuget(f.nuget, writeZip(alias)), /Unsafe/);
  const localName = Buffer.from(f.signed); const local = localName.indexOf(Buffer.from('Hephaera.nuspec')); localName[local] = 0x68; assert.throws(() => equivalentNuget(f.nuget, localName), /identity differs/);
  const symlink = Buffer.from(f.signed); let cursor = symlink.readUInt32LE(symlink.length - 6); symlink.writeUInt32LE((0o120777 << 16) >>> 0, cursor + 38); assert.throws(() => equivalentNuget(f.nuget, symlink), /Unsafe/);
  assert.throws(() => equivalentNuget(f.signed, f.signed), /remain unsigned/);
});

test('untrusted ZIP size metadata is rejected before any decompression', t => {
  const f = fixture(), bytes = Buffer.from(f.signed); let cursor = bytes.readUInt32LE(bytes.length - 6);
  bytes.writeUInt16LE(8, cursor + 10); bytes.writeUInt32LE(67108865, cursor + 24);
  let calls = 0; t.mock.method(zlib, 'inflateRawSync', () => { calls++; throw new Error('decompression must not run'); });
  assert.throws(() => equivalentNuget(f.nuget, bytes), /bounds/); assert.equal(calls, 0);
});

// These exercise default fetch/process adapters. Native verification is replaced
// only at spawnSync, so this is command/policy evidence, not a valid signature.
function defaults(f, scenario) {
  const script = String.raw`
    const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto'),tls=require('node:tls');
    const directory=process.argv[1],scenario=JSON.parse(process.argv[2]),receipt=JSON.parse(fs.readFileSync(path.join(directory,'package-build.json'))),modulePath=process.argv[3];
    const archives=require(process.argv[4]),files=Object.fromEntries(Object.entries(receipt.artifacts).map(([x,a])=>[x,path.join(directory,a.file)]));
    const npm=fs.readFileSync(files.npm),unsigned=fs.readFileSync(files.nuget),entries=archives.readZip(unsigned);entries.set('.signature.p7s',Buffer.from('owned mock signature, no crypto claim'));
    if(scenario.changedPayload)entries.set('Hephaera.nuspec',Buffer.from('tampered'));
    const signed=archives.writeZip(entries),certificate=new crypto.X509Certificate(tls.rootCertificates[0]),fingerprint=certificate.fingerprint256.replaceAll(':','').toLowerCase(),calls=[],requests=[];
    const integrity='sha512-'+crypto.createHash('sha512').update(npm).digest('base64');let npmPresent=!!scenario.existing,nugetPresent=!!scenario.existing;
    process.env.NPM_BOOTSTRAP_TOKEN='owned-bootstrap';process.env.NODE_AUTH_TOKEN='ambient-must-not-propagate';process.env.GITHUB_TOKEN='ambient-gh-must-not-propagate';process.env.NUGET_API_KEY='owned-nuget-key';
    process.env.GITHUB_ACTIONS='true';process.env.RUNNER_ENVIRONMENT='github-hosted';process.env.ACTIONS_ID_TOKEN_REQUEST_URL='https://token.actions.githubusercontent.com/oidc';process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN='owned-oidc';
    if(scenario.noCredentials)for(const key of ['NPM_BOOTSTRAP_TOKEN','NODE_AUTH_TOKEN','GITHUB_TOKEN','NUGET_API_KEY','ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN'])delete process.env[key];
    if(scenario.noNpmCredentials)for(const key of ['NPM_BOOTSTRAP_TOKEN','NODE_AUTH_TOKEN','ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN'])delete process.env[key];
    if(scenario.noOidc)for(const key of ['ACTIONS_ID_TOKEN_REQUEST_URL','ACTIONS_ID_TOKEN_REQUEST_TOKEN'])delete process.env[key];
    if(scenario.noBootstrap)delete process.env.NPM_BOOTSTRAP_TOKEN;
    cp.spawnSync=(command,args,options)=>{
      const kind=args[0]==='--version'?'sdk':args[0]==='nuget'?args[1]:'npm';calls.push({kind,args,envKeys:Object.keys(options.env)});
      const profiles=['USERPROFILE','APPDATA','LOCALAPPDATA','HOME','ProgramFiles','ProgramFiles(x86)','ProgramW6432','DOTNET_ROOT','DOTNET_ROOT(x86)','DOTNET_ROOT_X64','ALLUSERSPROFILE','PUBLIC'].filter(key=>process.env[key]);assert.ok(profiles.length);assert.equal(profiles.every(key=>options.env[key]===process.env[key]),true,'Normal SDK profile and machine paths must be retained.');
      if(command==='dotnet'&&kind==='sdk')return {status:0,stdout:scenario.wrongSdk?'9.0.0':'10.0.400',stderr:''};
      const configFlag=args.includes('--configfile')?'--configfile':'--userconfig',config=fs.readFileSync(args[args.indexOf(configFlag)+1],'utf8');
      assert.equal(config.includes('owned-bootstrap')||config.includes('owned-nuget-key')||config.includes('ambient-must-not-propagate'),false);
      assert.equal(Object.hasOwn(options.env,'GITHUB_TOKEN'),false);
      if(kind==='verify'){
        assert.equal(options.env.DOTNET_CLI_UI_LANGUAGE,'en');assert.equal(Object.hasOwn(options.env,'NUGET_API_KEY'),false);assert.equal(Object.hasOwn(options.env,'NODE_AUTH_TOKEN'),false);
        assert.ok(args.includes('--all')&&args.includes('--force-english-output'));assert.ok(config.includes('signatureValidationMode')&&config.includes('allowUntrustedRoot="false"')&&config.includes('<owners>TimothyMeadows</owners>'));
        const success='Signature type: Repository\nSHA256 hash: '+fingerprint+'\nSuccessfully verified package '+JSON.stringify(args[2])+'.\nFinished with 0 errors and 0 warnings.';
        return {status:scenario.verifyExit||0,stdout:scenario.verifyOutput||success,stderr:''};
      }
      if(kind==='push'){
        assert.equal(options.env.NUGET_API_KEY,'owned-nuget-key');assert.equal(Object.hasOwn(options.env,'NODE_AUTH_TOKEN'),false);assert.equal(args.includes('--api-key'),false);assert.ok(args.includes('https://api.nuget.org/v3/index.json'));assert.ok(fs.readFileSync(args[2]).equals(unsigned));nugetPresent=true;
      }else{
        assert.equal(command,process.execPath);assert.equal(args[1],'publish');assert.ok(args.includes('--registry=https://registry.npmjs.org')&&args.includes('--ignore-scripts')&&args.includes('--access')&&args.includes('public'));
        assert.ok(config.includes('@timothymeadows:registry=https://registry.npmjs.org/'));
        if(scenario.authMode==='bootstrap'){assert.equal(options.env.NODE_AUTH_TOKEN,'owned-bootstrap');assert.equal(Object.hasOwn(options.env,'ACTIONS_ID_TOKEN_REQUEST_TOKEN'),false);}
        else {assert.equal(Object.hasOwn(options.env,'NODE_AUTH_TOKEN'),false);assert.equal(options.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN,'owned-oidc');assert.equal(options.env.RUNNER_ENVIRONMENT,'github-hosted');}
        assert.ok(fs.readFileSync(args[2]).equals(npm));npmPresent=true;
      }
      return {status:0,stdout:'accepted',stderr:''};
    };
    const respond=(body,status=200)=>new Response(body,{status});
    globalThis.fetch=async (url,options)=>{
      assert.equal(options.redirect,'error');assert.equal(options.headers,undefined);url=String(url);requests.push(url);
      if(url==='https://registry.npmjs.org/@timothymeadows%2Fhephaera/'+receipt.version)return npmPresent?respond(JSON.stringify({name:'@timothymeadows/hephaera',version:receipt.version,dist:{integrity,tarball:'https://registry.npmjs.org/@timothymeadows/hephaera/-/hephaera-'+receipt.version+'.tgz'}})):respond('',404);
      if(url==='https://registry.npmjs.org/@timothymeadows/hephaera/-/hephaera-'+receipt.version+'.tgz')return respond(npm);
      if(url==='https://api.nuget.org/v3/index.json')return respond(JSON.stringify({resources:[{'@type':'PackageBaseAddress/3.0.0','@id':'https://api.nuget.org/v3-flatcontainer'},{'@type':'RepositorySignatures/5.0.0','@id':'https://api.nuget.org/v3-index/repository-signatures/5.0.0/index.json'}]}));
      if(url==='https://api.nuget.org/v3-flatcontainer/hephaera/'+receipt.version+'/hephaera.'+receipt.version+'.nupkg')return nugetPresent?respond(signed):respond('',404);
      if(url==='https://api.nuget.org/v3-index/repository-signatures/5.0.0/index.json')return respond(JSON.stringify({allRepositorySigned:true,signingCertificates:[{fingerprints:{'2.16.840.1.101.3.4.2.1':fingerprint},contentUrl:'https://api.nuget.org/v3-index/repository-signatures/certificates/'+fingerprint+'.crt'}]}));
      if(url==='https://api.nuget.org/v3-index/repository-signatures/certificates/'+fingerprint+'.crt')return respond(scenario.badCertificate?Buffer.from('invalid certificate'):scenario.wrongCertificate?new crypto.X509Certificate(tls.rootCertificates[1]).raw:certificate.raw);
      throw new Error('Unexpected owned fetch boundary');
    };
    const api=require(modulePath),options={expectedManifest:receipt.manifest,channels:scenario.channels,npmAuthMode:scenario.authMode||'trusted',io:{sleep:async()=>{}}};
    const promise=scenario.inspect?api.inspectPublic(directory,options):api.publishPublic(directory,{...options,execute:true});
    promise.then(result=>console.log(JSON.stringify({ok:true,result,calls,requests}))).catch(error=>console.log(JSON.stringify({ok:false,error:error.message,calls,requests})));
  `;
  const profiles = Object.fromEntries(['USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'HOME', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'DOTNET_ROOT', 'DOTNET_ROOT(x86)', 'DOTNET_ROOT_X64', 'ALLUSERSPROFILE', 'PUBLIC'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  return JSON.parse(cp.execFileSync(process.execPath, ['-e', script, f.directory, JSON.stringify(scenario), path.resolve(__dirname, '../installer/lib/public-publish.cjs'), path.resolve(__dirname, '../installer/scripts/archives.cjs')], { encoding: 'utf8', windowsHide: true, env: { SystemRoot: process.env.SystemRoot || '', ...profiles }, timeout: 20000 }));
}

test('default NuGet-only upload keeps key out of argv/config and verifies served content/signature policy', () => {
  const f = fixture(), result = defaults(f, { channels: ['nuget'], noNpmCredentials: true }); assert.equal(result.ok, true, result.error); assert.equal(result.result.selectedComplete, true); assert.equal(result.result.bothPublicReady, false);
  assert.equal(result.calls.filter(x => x.kind === 'push').length, 1); assert.equal(result.calls.filter(x => x.kind === 'npm').length, 0); assert.equal(result.calls.filter(x => x.kind === 'verify').length, 1);
  assert.notEqual(result.result.channels.nuget.servedSha256, hash(f.nuget)); assert.equal(result.result.channels.nuget.verification.owner, 'TimothyMeadows'); assert.ok(fs.existsSync(result.result.channels.nuget.verification.diagnosticsFile));
});

for (const authMode of ['trusted', 'bootstrap']) test('default public npm ' + authMode + ' mode isolates auth and uploads exact frozen tarball', () => {
  const f = fixture(), result = defaults(f, { channels: ['npm'], authMode }); assert.equal(result.ok, true, result.error); assert.equal(result.result.selectedComplete, true); assert.equal(result.result.channels.nuget.status, 'not-selected');
  assert.equal(result.calls.filter(x => x.kind === 'npm').length, 1); assert.equal(result.calls.filter(x => x.kind === 'push').length, 0);
});

test('matching default public packages require no publishing credentials and inspect has no journal', () => {
  const f = fixture(), result = defaults(f, { channels: ['npm', 'nuget'], existing: true, inspect: true, noCredentials: true }); assert.equal(result.ok, true, result.error); assert.equal(result.result.bothPublicReady, true);
  assert.equal(result.calls.some(x => ['npm', 'push'].includes(x.kind)), false); assert.equal(fs.existsSync(path.join(f.directory, 'public-publication.json')), false);
});

test('default npm modes cannot fall back to unrelated token credentials', () => {
  for (const scenario of [{ authMode: 'trusted', noOidc: true }, { authMode: 'bootstrap', noBootstrap: true }]) {
    const f = fixture(), result = defaults(f, { channels: ['npm'], ...scenario }); assert.equal(result.ok, false); assert.match(result.error, /credentials|identity/); assert.equal(result.calls.some(x => x.kind === 'npm'), false);
    assert.equal(journal(f).history[0].event, 'started'); assert.equal(journal(f).channels.npm.attempts, 0); assert.equal(journal(f).history.some(x => x.event === 'write-intent'), false);
  }
});

test('default NuGet admission rejects tamper, untrusted certificates, wrong SDK and skipped/warning verification', () => {
  for (const scenario of [{ changedPayload: true }, { badCertificate: true }, { wrongCertificate: true }, { wrongSdk: true }, { verifyExit: 1 }, { verifyOutput: 'Successfully verified package "fixture".\nSignature type: Author' }, { verifyOutput: 'warning NU3028: signature could not be validated\nSuccessfully verified package "fixture".\nSignature type: Repository' }, { verifyOutput: 'Finished with 0 errors and 0 warnings.' }]) {
    const result = defaults(fixture(), { channels: ['nuget'], existing: true, inspect: true, ...scenario }); assert.equal(result.ok, false); assert.match(result.error, /readback failed or differs/); assert.equal(result.calls.some(x => ['npm', 'push'].includes(x.kind)), false);
  }
});
