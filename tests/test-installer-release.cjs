'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const release = require('../installer/lib/release.cjs');
const ROOT = path.resolve(__dirname,'..');
function fixture() {
  const root=path.join(ROOT,'.local/installer-release-tests',crypto.randomUUID()); fs.mkdirSync(path.join(root,'installer/core'),{recursive:true});fs.mkdirSync(path.join(root,'runtime'),{recursive:true});
  fs.copyFileSync(path.join(ROOT,'installer/version.json'),path.join(root,'installer/version.json'));
  fs.copyFileSync(path.join(ROOT,'runtime/bubo.lock.json'),path.join(root,'runtime/bubo.lock.json'));
  for(const name of ['manifest.cjs','files.cjs'])fs.copyFileSync(path.join(ROOT,'installer/core',name),path.join(root,'installer/core',name));
  fs.writeFileSync(path.join(root,'installer/core/cli.cjs'),"'use strict'; console.log('fixture');\n");
  const git=(...a)=>cp.execFileSync('git',['-C',root,...a],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
  git('init');git('config','user.name','Installer Test');git('config','user.email','installer@example.invalid');git('config','core.autocrlf','false');git('remote','add','origin',release.repository);git('add','.');
  const bubo=JSON.parse(fs.readFileSync(path.join(root,'runtime/bubo.lock.json')));
  git('update-index','--add','--cacheinfo',`160000,${bubo.revision},runtime/bubo`);git('commit','-m','Test release fixture');fs.mkdirSync(path.join(root,'runtime/bubo'),{recursive:true});
  const version=JSON.parse(fs.readFileSync(path.join(root,'installer/version.json'))).version;git('tag',version);git('update-ref','refs/remotes/origin/main','HEAD');return {root,git,version};
}
test('release manifest binds actual committed core, Git tree/tag and Bubo gitlink',()=>{
 const {root,git,version}=fixture(),manifest=release.verifyReleaseSource(root,version);
 assert.equal(manifest.revision,git('rev-parse','HEAD'));assert.equal(manifest.tree,git('rev-parse','HEAD^{tree}'));assert.equal(manifest.sourceDirty,false);
 assert.equal(release.verifyManifest(manifest,path.join(root,'installer/core')).coreVerified,true);
 fs.appendFileSync(path.join(root,'installer/core/cli.cjs'),'// changed\n');
 assert.throws(()=>release.createManifest(root),/clean/);assert.equal(release.createManifest(root,{allowDirty:true}).sourceDirty,true);
 assert.throws(()=>release.verifyManifest(manifest,path.join(root,'installer/core')),/changed/);
});
test('release verification rejects a moved tag and a parent/runtime lock mismatch',()=>{
 const {root,git,version}=fixture();git('tag','-f',version,git('hash-object','-w','installer/version.json'));
 assert.throws(()=>release.verifyReleaseSource(root,version));
 const b=JSON.parse(fs.readFileSync(path.join(root,'runtime/bubo.lock.json')));b.revision='a'.repeat(40);fs.writeFileSync(path.join(root,'runtime/bubo.lock.json'),JSON.stringify(b));
 assert.throws(()=>release.createManifest(root,{allowDirty:true}),/gitlink/);
});

test('release source accepts canonical checkout origin with or without git suffix only',()=>{const {root,git,version}=fixture();git('remote','set-url','origin','https://github.com/TimothyMeadows/Hephaera');assert.equal(release.verifyReleaseSource(root,version).sourceDirty,false);git('remote','set-url','origin','https://github.com/other/Hephaera');assert.throws(()=>release.verifyReleaseSource(root,version),/canonical/);});

test('release rejects versions that npm and NuGet could normalize differently',()=>{const {root}=fixture();fs.writeFileSync(path.join(root,'installer/version.json'),JSON.stringify({schemaVersion:1,version:'5.1.0-rc.01'}));assert.throws(()=>release.createManifest(root,{allowDirty:true}),/leading zeroes/);});
