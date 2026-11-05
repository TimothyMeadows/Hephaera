'use strict';

const fs = require('fs');
const path = require('path');

module.exports = {
  chromium: {
    async launch(options) {
      if (options?.chromiumSandbox !== true || options?.headless !== true) throw new Error('sandboxed headless launch was not requested');
      let cancelEvaluation;
      return {
        async newContext(contextOptions) {
          if (contextOptions?.serviceWorkers !== 'block') throw new Error('service workers were not blocked');
          let profile;
          return {
            async newPage() {
              return {
                async route() {},
                async goto(url) {
                  const response = await fetch(url);
                  const html = await response.text();
                  if (!response.ok || !html.includes('createCodeCharacterEvidenceAdapter')) {
                    throw new Error('loopback evidence page was not served');
                  }
                  const imports = [...html.matchAll(/import\s+[^;]+\s+from\s+["']([^"']+)["'];/g)].map((match) => match[1]);
                  if (imports.length !== 2) throw new Error('evidence page must import Three.js and its adapter');
                  const pending = imports.map((imported) => new URL(imported, url).href);
                  const visited = new Set();
                  while (pending.length) {
                    const imported = pending.pop();
                    if (visited.has(imported)) continue;
                    visited.add(imported);
                    const served = await fetch(imported);
                    if (!served.ok) throw new Error('admitted browser module was not served');
                    const source = await served.text();
                    if (/\.json$/.test(imported)) {
                      if (!/application\/json/.test(served.headers.get('content-type'))) throw new Error('JSON import has incorrect MIME');
                      JSON.parse(source);
                    } else {
                      if (!/javascript/.test(served.headers.get('content-type'))) throw new Error('module has incorrect MIME');
                      for (const match of source.matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) pending.push(new URL(match[1], imported).href);
                    }
                  }
                },
                async evaluate(callback, argument) {
                  const source = callback.toString();
                  if (source.includes('__hephaeraEvidence.start')) {
                    profile = argument.profile;
                    if (process.env.HEPHAERA_EVIDENCE_FIXTURE_MUTATE === 'source') {
                      const root = path.resolve(__dirname, '../..');
                      const manifest = JSON.parse(fs.readFileSync(path.join(root, profile.codeModel.manifest), 'utf8'));
                      fs.appendFileSync(path.join(root, manifest.target.sourcePath), '// inert capture-time fixture revision\n');
                    }
                    return true;
                  }
                  if (source.includes('__hephaeraEvidence.capture') && process.env.HEPHAERA_EVIDENCE_FIXTURE_CANCEL === '1') {
                    return new Promise((resolve, reject) => {
                      cancelEvaluation = () => reject(new Error('owned fixture browser closed'));
                      setImmediate(() => process.emit('SIGTERM'));
                    });
                  }
                  if (source.includes('__hephaeraEvidence.capture') || source.includes('__hephaeraEvidence.stop')) return undefined;
                  if (source.includes('__hephaeraEvidence.sample')) {
                    const attachmentGaps = profile.structure.attachments.map(({ part, host }) => ({ part, host, gapRatio: 0 }));
                    const symmetry = profile.structure.symmetryGroups.map(({ id }) => ({ id, deviationRatio: 0 }));
                    return {
                      structure: {
                        coordinateSystem: profile.structure.coordinateSystem,
                        pivotStable: true,
                        finiteTransforms: true,
                        boundsFinite: true,
                        parts: profile.structure.parts.map(({ id, parent }) => ({ id, parent })),
                        anchors: ['origin'],
                        joints: profile.structure.joints.map(({ id }) => id),
                        sockets: profile.structure.sockets.map(({ id }) => id),
                        colliders: profile.structure.colliders.map(({ id }) => id),
                        minimumY: 0,
                        groundY: 0,
                        height: 1,
                        attachmentGaps,
                        symmetry
                      },
                      motion: {
                        mode: profile.motion.mode,
                        skeletonId: profile.motion.skeletonId,
                        maxInfluencesPerVertex: profile.motion.maxInfluencesPerVertex,
                        weightsFiniteNormalized: true,
                        deformationBoundsFinite: true,
                        roles: profile.motion.requiredRoles,
                        poses: profile.motion.representativePoses,
                        contacts: profile.motion.clips.flatMap((clip) => clip.contacts.map((id) => ({ id, errorRatio: 0 }))),
                        movingPartCount: profile.motion.mode === 'static' ? 0 : 1
                      },
                      runtime: {
                        constructionHashes: Array(argument.constructionRuns).fill('stable-browser-capture'),
                        lifecycle: Array.from({ length: argument.lifecycleCycles }, (_, index) => ({ cycle: index + 1, resourceDelta: 0, staleCallbacks: 0 })),
                        actors: argument.actorCount,
                        metrics: {
                          triangles: 0, drawCalls: 0, materials: 0, textures: 0,
                          bones: 0, clips: profile.motion.clips.length, shaderVariants: 0, textureBytes: 0,
                          cpuMilliseconds: null, gpuMilliseconds: null
                        }
                      }
                    };
                  }
                  throw new Error(`Unexpected browser evaluation: ${source}`);
                },
                locator(selector) {
                  if (selector !== '#stage') throw new Error('unexpected screenshot target');
                  return {
                    async screenshot({ path, animations }) {
                      if (animations !== 'disabled') throw new Error('capture animations were not disabled');
                      fs.writeFileSync(path, Buffer.from('deterministic-test-image'));
                    }
                  };
                }
              };
            }
          };
        },
        async close() { cancelEvaluation?.(); }
      };
    }
  }
};
