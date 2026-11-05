import * as THREE from 'three';
import * as Quarks from 'three.quarks';
import {createThreeVfxRuntime as createBaseline} from '/assets/baseline/three-vfx-runtime.mjs';
import {createThreeVfxRuntime as createCandidate} from '/source/.engine/threejs/particles/three-vfx-runtime.mjs';
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
const read = async name => { const response = await fetch('/assets/' + name); if (!response.ok) throw Error('Required controlled input missing'); return new Uint8Array(await response.arrayBuffer()); };
const parse = bytes => JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
window.__actionPerformanceReady = false;
try {
  const started = performance.now(), names = ['perf-package.json', 'perf-profile.json', 'swatch-correspondence.json', 'swatch.png', 'swatch.rgba', 'fixture.json'];
  const files = Object.fromEntries(await Promise.all(names.map(async name => [name, await read(name)]))), hashes = Object.fromEntries(await Promise.all(names.map(async name => [name, await hash(files[name])])));
  const pkg = parse(files['perf-package.json']), profile = parse(files['perf-profile.json']), correspondence = parse(files['swatch-correspondence.json']), fixture = parse(files['fixture.json']);
  if (profile.layers.length !== 1 || profile.layers[0].family !== 'sprite' || pkg.resources.length !== 1 || correspondence.width !== 1 || correspondence.height !== 1 || files['swatch.rgba'].length !== 4 || profile.nativePackageSha256 !== hashes['perf-package.json'] || correspondence.pixelsSha256 !== hashes['swatch.rgba'] || correspondence.sourceSha256 !== hashes['swatch.png'] || pkg.resources[0].sha256 !== hashes['swatch.png']) throw Error('Exact common workload differs from source/correspondence');
  const inputLoadMs = performance.now() - started;
  const renderer = new THREE.WebGLRenderer({canvas: document.querySelector('#view'), alpha: false, antialias: false, preserveDrawingBuffer: true}); renderer.setPixelRatio(1); renderer.setSize(960, 540, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping; renderer.info.autoReset = false;
  const gl = renderer.getContext(); if (!(gl instanceof WebGL2RenderingContext) || gl.isContextLost()) throw Error('Actual selected WebGL2 required');
  const debug = gl.getExtension('WEBGL_debug_renderer_info'), driver = {webgl: gl.getParameter(gl.VERSION), glsl: gl.getParameter(gl.SHADING_LANGUAGE_VERSION), vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : 'unavailable', renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unavailable'};
  const shaderErrors = []; renderer.debug.onShaderError = (context, program, vertex, fragment) => shaderErrors.push({program: context.getProgramInfoLog(program), vertex: context.getShaderInfoLog(vertex), fragment: context.getShaderInfoLog(fragment)});
  const originalRandom = Math.random, pixels = new Uint8Array(960 * 540 * 4); let running = false;
  const quantumSamples = []; let clockPrevious = performance.now(); for (let index = 0; index < 10000; index++) { const value = performance.now(); if (value > clockPrevious) quantumSamples.push(value - clockPrevious); clockPrevious = value; } const clockQuantumMs = quantumSamples.length ? Math.min(...quantumSamples) : null;
  const reseed = seed => { Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; };
  function timed(operation) { gl.finish(); const start = performance.now(), value = operation(), cpuEnd = performance.now(); gl.finish(); return {value, cpuMs: cpuEnd - start, finishWallMs: performance.now() - start}; }
  function inventory(scene, service) {
    let owners = 0; const systems = [], arrays = new Set(); scene.traverse(node => { if (node.type === 'BatchedRenderer') owners++;
      if (node.system instanceof Quarks.ParticleSystem) systems.push(node.system.particles.slice(0, node.system.particleNum).map(particle => ({age: particle.age, life: particle.life, position: [particle.position.x, particle.position.y, particle.position.z], velocity: [particle.velocity.x, particle.velocity.y, particle.velocity.z]})));
      for (const attribute of [...Object.values(node.geometry?.attributes || {}), node.geometry?.index].filter(Boolean)) arrays.add(attribute.array || attribute.data.array); });
    return {owners, systems: systems.length, particles: systems.reduce((sum, system) => sum + system.length, 0), typedArrayBytes: [...arrays].reduce((sum, array) => sum + array.byteLength, 0), draws: {...renderer.info.render}, memory: {...renderer.info.memory}, service: service.stats(), particleState: systems};
  }
  async function run({variant, id}) {
    if (running || !['baseline', 'candidate'].includes(variant) || typeof id !== 'string') throw Error('Bounded exclusive variant required'); running = true;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x101720); const camera = new THREE.OrthographicCamera(-4.2, 4.2, 2.36, -2.36, .1, 100); camera.position.set(2.7, 3.2, 8); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
    let service, texture; const stages = {}, priorErrors = shaderErrors.length;
    try {
      const input = timed(() => { texture = new THREE.DataTexture(files['swatch.rgba'].slice(), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType); texture.needsUpdate = true; }); stages.inputResource = {cpuMs: input.cpuMs, finishWallMs: input.finishWallMs};
      const construction = timed(() => (variant === 'baseline' ? createBaseline : createCandidate)({THREE, Quarks, scene, renderer, engineSelection: fixture.engineSelection, budgets: profile.budgets})); service = construction.value; stages.runtimeConstruction = {cpuMs: construction.cpuMs, finishWallMs: construction.finishWallMs};
      const admission = timed(() => service.admit({package: pkg, packageBytes: files['perf-package.json'], packageSha256: hashes['perf-package.json'], profile,
        bindings: [{id: 'swatch', sha256: pkg.resources[0].sha256, texture, width: 1, height: 1, colorSpace: 'srgb', alpha: 'straight', review: {resourceSha256: pkg.resources[0].sha256, pixelsSha256: correspondence.pixelsSha256, independent: true, sourceEvidence: {path: 'swatch-correspondence.json', sha256: hashes['swatch-correspondence.json']}}}]}));
      const admitted = admission.value; stages.resourceAdmission = {cpuMs: admission.cpuMs, finishWallMs: admission.finishWallMs};
      const acquire = (id, position) => service.acquire({package: admitted, effectId: 'common', layerId: 'sprite', id, ownerId: id, transform: {position}});
      const first = timed(() => acquire('actor-a', [-1, 0, 0])); stages.firstAcquire = {cpuMs: first.cpuMs, finishWallMs: first.finishWallMs};
      const render = () => renderer.render(scene, camera); reseed(17);
      const update = timed(() => service.update(1 / 120)); stages.initialUpdate = {cpuMs: update.cpuMs, finishWallMs: update.finishWallMs}; renderer.info.reset();
      const compile = timed(() => { renderer.compile(scene, camera); render(); }); stages.firstCompileRender = {cpuMs: compile.cpuMs, finishWallMs: compile.finishWallMs};
      function phase() { const samples = []; gl.finish(); const start = performance.now(); for (let frame = 0; frame < 32; frame++) { renderer.info.reset(); const a = performance.now(); service.update(1 / 120); const b = performance.now(); render(); const c = performance.now(); gl.finish(); const d = performance.now(); samples.push({updateCpuMs: b - a, renderSubmitCpuMs: c - b, finishWaitMs: d - c, frameFinishWallMs: d - a}); } return {samples, perFrameWallMs: (performance.now() - start) / 32, inventory: inventory(scene, service)}; }
      const steady = phase(); const more = timed(() => { acquire('actor-b', [1, 0, 0]); acquire('ambient', [0, .5, 0]); }); stages.peakAcquire = {cpuMs: more.cpuMs, finishWallMs: more.finishWallMs};
      reseed(29); service.update(1 / 120); renderer.info.reset(); const peakCompile = timed(() => { renderer.compile(scene, camera); render(); }); stages.peakCompileRender = {cpuMs: peakCompile.cpuMs, finishWallMs: peakCompile.finishWallMs}; const peak = phase();
      gl.readPixels(0, 0, 960, 540, gl.RGBA, gl.UNSIGNED_BYTE, pixels); let occupiedPixels = 0; for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - pixels[0]) + Math.abs(pixels[i + 1] - pixels[1]) + Math.abs(pixels[i + 2] - pixels[2]) > 15) occupiedPixels++;
      if (steady.inventory.owners !== 1 || peak.inventory.owners !== 1 || steady.inventory.systems !== 1 || steady.inventory.particles !== 32 || peak.inventory.systems !== 3 || peak.inventory.particles !== 96 || !occupiedPixels || gl.getError() || shaderErrors.length !== priorErrors) throw Error('Matched actual workload, pixels, owner or shader check failed');
      const signatures = {steady: await hash(new TextEncoder().encode(JSON.stringify(steady.inventory.particleState))), peak: await hash(new TextEncoder().encode(JSON.stringify(peak.inventory.particleState)))}; delete steady.inventory.particleState; delete peak.inventory.particleState;
      service.dispose(); service = null; texture.dispose(); texture = null; gl.finish(); if (scene.children.length) throw Error('Common benchmark scene leaked owned resources');
      return {variant, id, stages, steady, peak, signatures, occupiedPixels, cleanup: {sceneChildren: scene.children.length, memory: {...renderer.info.memory}}};
    } finally { service?.dispose(); texture?.dispose(); Math.random = originalRandom; running = false; }
  }
  window.__actionPerformance = {run, driver, inputHashes: hashes, inputLoadMs, clockQuantumMs, dispose() { if (running) throw Error('Benchmark is active'); renderer.dispose(); }}; window.__actionPerformanceReady = true;
} catch (error) { window.__performanceError = String(error.stack || error); document.querySelector('#status').textContent = 'Unavailable: ' + error.message; console.error(error); }
