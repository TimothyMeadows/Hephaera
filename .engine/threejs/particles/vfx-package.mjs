// Original data-only admission. Native verification/rights/review stay with the host.
export const VFX_FAMILIES = Object.freeze(['sprite','burst','ring','mesh','projectile','trail','impact','ground-indicator','beam']);
export const fail = message => { throw new Error(message); };
export function number(value, low, high, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < low || value > high) fail(`${name} must be finite within ${low}..${high}.`);
  return value;
}
export function integer(value, low, high, name) {
  number(value,low,high,name); if (!Number.isSafeInteger(value)) fail(`${name} must be an integer.`); return value;
}
export function fields(value, allowed, name) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).some(key => typeof key!=='string'||!allowed.includes(key)||!('value' in Object.getOwnPropertyDescriptor(value,key)))) fail(`Unknown, accessor or invalid ${name} fields.`);
}
export function identifier(value, name = 'id') { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value)) fail(`Invalid ${name}.`); return value; }
export function hash(value, name = 'SHA-256') { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`Invalid ${name}.`); return value; }
export function deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
function dataCopy(input) {
  let count = 0, characters = 0;
  function copy(value, depth) {
    if (++count > 65536 || depth > 12) fail('VFX data exceeds the bounded object envelope.');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') { if (typeof value === 'string') {characters+=value.length;if(value.length>4096||characters>4194304)fail('VFX strings exceed the bounded data envelope.');}return value; }
    if (typeof value === 'number') return number(value, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'VFX number');
    if (Array.isArray(value)) {
      const length=Object.getOwnPropertyDescriptor(value,'length');
      if(Object.getPrototypeOf(value)!==Array.prototype||!length||!('value' in length)||!Number.isInteger(length.value)||length.value<0||length.value>4096)fail('VFX arrays require a bounded plain dense layout.');
      const keys=Reflect.ownKeys(value);
      if(keys.length!==length.value+1||keys.some(key=>typeof key!=='string'||(key!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=length.value))))fail('Sparse or extended VFX arrays are forbidden.');
      const output=[];
      for(let i=0;i<length.value;i++){
        const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
        if(!descriptor||!('value' in descriptor))fail('VFX array accessors are forbidden.');
        output.push(copy(descriptor.value,depth+1));
      }
      return output;
    }
    if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail('VFX recipes contain plain data only.');
    const output = {};
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      if (typeof key!=='string'||['__proto__','prototype','constructor'].includes(key) || !descriptor || !('value' in descriptor)) fail('VFX accessors and prototype fields are forbidden.');
      output[key] = copy(descriptor.value,depth+1);
    }
    return output;
  }
  return copy(input,0);
}
const gcd = (a,b) => b ? gcd(b,a%b) : a;

/** The only top-left-pixel -> bottom-left-UV conversion used by this adapter.
 * Textures are owned wrappers uploaded with flipY=true. Returned rectangle is
 * interior-only; gutters never enlarge the visible sprite.
 */
export function atlasFrameUv(atlas, frameIndex) {
  integer(frameIndex,0,atlas.frames.length-1,'frameIndex');
  const f = atlas.frames[frameIndex];
  return Object.freeze({u0:f.x/atlas.width,v0:1-(f.y+f.height)/atlas.height,u1:(f.x+f.width)/atlas.width,v1:1-f.y/atlas.height});
}
export function atlasFrameIndex(atlas, ageSeconds) {
  number(ageSeconds,0,3600,'frame age');
  let frame = Math.floor(ageSeconds * atlas.rateNumerator / atlas.rateDenominator);
  // Multiplication/division can round one ULP below an exactly supplied
  // rational boundary. Compare the represented age with the reconstructed
  // boundary itself; an earlier representable age must stay in the prior frame.
  if(ageSeconds >= (frame+1)*atlas.rateDenominator/atlas.rateNumerator)frame++;
  else if(ageSeconds < frame*atlas.rateDenominator/atlas.rateNumerator)frame--;
  return atlas.loop === 'repeat' ? frame % atlas.frames.length : Math.min(frame,atlas.frames.length-1);
}
function atlasLayout(a) {
  fields(a,['resourceId','width','height','origin','alpha','colorSpace','padding','extrusion','frames','rateNumerator','rateDenominator','loop','durationNumerator','durationDenominator','bindings'],'atlas');
  identifier(a.resourceId); integer(a.width,1,8192,'atlas width'); integer(a.height,1,8192,'atlas height');
  if (a.width*a.height > 16777216 || a.origin !== 'top-left' || a.alpha !== 'straight' || !['srgb','linear'].includes(a.colorSpace)) fail('Unsupported atlas pixel/alpha/color profile.');
  integer(a.padding,0,64,'padding'); integer(a.extrusion,0,64,'extrusion');
  integer(a.rateNumerator,1,1000000,'rateNumerator'); integer(a.rateDenominator,1,1000000,'rateDenominator');
  if (!['once','repeat'].includes(a.loop) || !Array.isArray(a.frames) || !a.frames.length || a.frames.length>256) fail('Unsupported atlas timing/frame inventory.');
  const n=a.frames.length*a.rateDenominator, d=gcd(n,a.rateNumerator);
  if (a.durationNumerator!==n/d || a.durationDenominator!==a.rateNumerator/d || n/a.rateNumerator>3600) fail('Atlas reduced rational duration differs from its frame rate/count.');
  const first = a.frames[0], border=a.padding+a.extrusion;
  const columns = a.width/first.cellWidth, rows=a.height/first.cellHeight;
  if (!Number.isInteger(columns) || !Number.isInteger(rows)) fail('Unsupported atlas layout: equal complete grid cells required.');
  const occupied = new Set();
  a.frames.forEach((f,index) => {
    fields(f,['sourceFrame','cellX','cellY','cellWidth','cellHeight','x','y','width','height'],'atlas frame');
    for (const key of Object.keys(f)) integer(f[key],key==='sourceFrame'||key==='x'||key==='y'||key==='cellX'||key==='cellY'?0:1,65536,`atlas ${key}`);
    if (f.cellWidth!==first.cellWidth || f.cellHeight!==first.cellHeight || f.width!==first.width || f.height!==first.height || f.cellX%f.cellWidth || f.cellY%f.cellHeight || f.cellX+f.cellWidth>a.width || f.cellY+f.cellHeight>a.height || f.x!==f.cellX+border || f.y!==f.cellY+border || f.cellWidth!==f.width+2*border || f.cellHeight!==f.height+2*border) fail('Unsupported atlas layout: uniform interior rectangles and padding required.');
    const tile=f.cellY/f.cellHeight*columns+f.cellX/f.cellWidth;
    if (occupied.has(tile)) fail('Atlas cells overlap.'); occupied.add(tile);
    atlasFrameUv(a,index);
  });
  if (!Array.isArray(a.bindings) || !a.bindings.length || a.bindings.length>1024) fail('Atlas layer bindings required.');
  a.bindings.forEach(b => { fields(b,['effectId','layerId'],'atlas binding'); identifier(b.effectId); identifier(b.layerId); });
  return {columns,rows,tiles:a.frames.map(f=>f.cellY/f.cellHeight*columns+f.cellX/f.cellWidth)};
}

/** Validate a fixed host-authored production profile against an exact verified
 * native declaration. This never verifies file bytes, grants rights or expands
 * the native layer caps. The caller must freshly native-verify the package.
 */
export function validateVfxPackage(input) {
  fields(input,['package','packageSha256','preparationSha256','profile'],'admission');
  const {package:p,profile,packageSha256,preparationSha256} = dataCopy(input);
  hash(packageSha256,'packageSha256'); if (preparationSha256!==undefined) hash(preparationSha256,'preparationSha256');
  fields(p,['schemaVersion','id','version','styleSha256','engine','budgets','resources','effects','atlases'],'native package');
  if (!['bubo-vfx-package/v1','bubo-vfx-package/v2'].includes(p.schemaVersion)) fail('Unsupported native package schema.');
  identifier(p.id); identifier(p.version); hash(p.styleSha256);
  fields(p.engine,['id','contractSha256','definitionSha256','registrySha256'],'engine');
  if (p.engine.id!=='THREEJS') fail('Production effects require selected THREEJS.');
  for (const key of ['contractSha256','definitionSha256','registrySha256']) hash(p.engine[key]);
  const nativeBudgetKeys=['maxPackageBytes','maxDependencyBytes','maxTotalDependencyBytes','maxDependencies','maxEffects','maxLayers','maxParticles','maxVertices','maxDrawCalls','maxTrailPoints','maxDurationSeconds'];
  fields(p.budgets,nativeBudgetKeys,'native budgets'); nativeBudgetKeys.forEach(key => key==='maxDurationSeconds'?number(p.budgets[key],.000001,3600,`native ${key}`):integer(p.budgets[key],1,4294967296,`native ${key}`));
  if(new TextEncoder().encode(JSON.stringify(p)).length>Math.min(4194304,p.budgets.maxPackageBytes))fail('Native package data exceeds its declared byte envelope.');
  fields(profile,['schemaVersion','nativePackageSha256','preparationSha256','budgets','layers'],'production profile');
  if (profile.schemaVersion!=='hephaera-three-vfx-profile/v1' || profile.nativePackageSha256!==packageSha256 || profile.preparationSha256!==preparationSha256) fail('Production profile package/preparation identity mismatch.');
  const ceilings={maxSystems:128,maxParticles:65536,maxTrailPoints:65536,maxVertices:16777216,maxIndices:50331648,maxDrawCalls:128,maxTextureBytes:268435456,maxBufferBytes:268435456,maxDurationSeconds:3600,maxUpdateSeconds:.1};
  fields(profile.budgets,Object.keys(ceilings),'production budgets');
  for (const [key,max] of Object.entries(ceilings)) key==='maxUpdateSeconds'||key==='maxDurationSeconds'?number(profile.budgets[key],key==='maxUpdateSeconds'?.001:.000001,max,key):integer(profile.budgets[key],['maxTrailPoints','maxIndices','maxTextureBytes'].includes(key)?0:1,max,key);
  if (!Array.isArray(p.resources)||p.resources.length<1||p.resources.length>1024||p.resources.length>p.budgets.maxDependencies||!Array.isArray(p.effects)||!p.effects.length||p.effects.length>64||p.effects.length>p.budgets.maxEffects) fail('Invalid bounded native inventory.');
  const resources=new Map(), resourceNames=new Set(), paths=new Set(); let dependencyBytes=0;
  for (const r of p.resources) {
    fields(r,['id','kind','path','sha256','bytes'],'resource'); identifier(r.id); hash(r.sha256); integer(r.bytes,1,1073741824,'resource bytes');
    if (!['texture-png','mesh-glb'].includes(r.kind)||typeof r.path!=='string'||r.path.length>1024||r.path.split('/').some(s=>!s||s==='.'||s==='..'||/[\\:\x00-\x1f]/.test(s))||!r.path.toLowerCase().endsWith(r.kind==='texture-png'?'.png':'.glb')||resourceNames.has(r.id.toLowerCase())||paths.has(r.path.toLowerCase())) fail('Invalid/duplicate native resource.');
    resourceNames.add(r.id.toLowerCase()); paths.add(r.path.toLowerCase()); resources.set(r.id,r); dependencyBytes+=r.bytes;
    if (r.bytes>p.budgets.maxDependencyBytes) fail('Native dependency byte cap exceeded.');
  }
  if (dependencyBytes>p.budgets.maxTotalDependencyBytes) fail('Native total dependency byte cap exceeded.');
  const declarations=new Map(), effectNames=new Set(), sums={maxParticles:0,maxVertices:0,maxDrawCalls:0,maxTrailPoints:0}, referenced=new Set(); let duration=0;
  for (const e of p.effects) {
    fields(e,['id','durationSeconds','layers'],'effect'); identifier(e.id); number(e.durationSeconds,.000001,3600,'effect duration');
    if (effectNames.has(e.id.toLowerCase())||!Array.isArray(e.layers)||!e.layers.length||e.layers.length>1024) fail('Invalid/duplicate native effect.'); effectNames.add(e.id.toLowerCase()); duration+=e.durationSeconds;
    const names=new Set();
    for (const l of e.layers) {
      fields(l,['id','kind','startSeconds','durationSeconds','resourceIds','maxParticles','maxVertices','maxDrawCalls','maxTrailPoints'],'native layer'); identifier(l.id);
      if (names.has(l.id.toLowerCase())||!VFX_FAMILIES.includes(l.kind)) fail('Invalid/duplicate native layer.'); names.add(l.id.toLowerCase());
      number(l.startSeconds,0,3600,'layer start'); number(l.durationSeconds,.000001,3600,'layer duration'); if(l.startSeconds+l.durationSeconds>e.durationSeconds+1e-10) fail('Layer interval exceeds native effect.');
      for (const key of Object.keys(sums)) { integer(l[key],key==='maxVertices'||key==='maxDrawCalls'?1:0,16777216,key); sums[key]+=l[key]; }
      if (!Array.isArray(l.resourceIds)||l.resourceIds.length>1024||new Set(l.resourceIds).size!==l.resourceIds.length) fail('Invalid native resource references.');
      let meshes=0;
      l.resourceIds.forEach(id=> { if(!resources.has(id)) fail('Missing native resource.'); referenced.add(id); if(resources.get(id).kind==='mesh-glb') meshes++; });
      if (meshes>1||(l.kind==='mesh'&&meshes!==1)||(meshes&&!['mesh','projectile','impact'].includes(l.kind))||(['sprite','projectile','impact'].includes(l.kind)&&!l.resourceIds.length)) fail('Incompatible native mesh/texture family.');
      declarations.set(`${e.id}/${l.id}`,l);
    }
  }
  if (duration>p.budgets.maxDurationSeconds||declarations.size>p.budgets.maxLayers||referenced.size!==resources.size) fail('Native aggregate duration/layer/resource cap exceeded.');
  for (const key of Object.keys(sums)) if(sums[key]>p.budgets[key]) fail(`Native aggregate ${key} cap exceeded.`);
  const atlasByLayer=new Map(), atlasResources=new Set();
  if (p.schemaVersion==='bubo-vfx-package/v1') { if(p.atlases!==undefined) fail('v1 cannot acquire v2 atlas semantics.'); }
  else {
    if (!Array.isArray(p.atlases)||!p.atlases.length||p.atlases.length>1024) fail('v2 atlas inventory required.');
    for (const a of p.atlases) {
      const layout=atlasLayout(a); if(resources.get(a.resourceId)?.kind!=='texture-png'||atlasResources.has(a.resourceId)) fail('Invalid atlas resource binding.'); atlasResources.add(a.resourceId);
      for(const b of a.bindings) { const key=`${b.effectId}/${b.layerId}`; if(atlasByLayer.has(key)||!declarations.get(key)?.resourceIds.includes(a.resourceId)) fail('Invalid/duplicate atlas layer binding.'); atlasByLayer.set(key,{metadata:a,layout}); }
    }
    for(const r of resources.values()) if(r.kind==='texture-png'&&!atlasResources.has(r.id)) fail('Every v2 PNG needs atlas metadata.');
    for(const [key,l] of declarations) { const textures=l.resourceIds.filter(id=>resources.get(id).kind==='texture-png'); if(textures.length>1||(textures.length===1&&!atlasByLayer.has(key))) fail('Each texture layer needs exactly one atlas binding.'); }
  }
  if (!Array.isArray(profile.layers)||!profile.layers.length||profile.layers.length>128||profile.layers.length>profile.budgets.maxSystems) fail('Invalid production layer inventory.');
  const selected=new Set();
  const layers=profile.layers.map(c=> {
    fields(c,['effectId','layerId','family','emission','size','speed','color','space','maxTailSeconds','resourceId','geometry','trail'],'production layer');
    identifier(c.effectId); identifier(c.layerId); const key=`${c.effectId}/${c.layerId}`, native=declarations.get(key);
    if (!native||selected.has(key)||c.family!==native.kind) fail('Production family/layer identity mismatch.'); selected.add(key);
    fields(c.emission,['kind','capacity','count','rate','lifetimeSeconds','durationSeconds'],'emission'); const em=c.emission;
    integer(em.capacity,1,65536,'capacity'); integer(em.count,0,em.capacity,'count'); number(em.rate,0,10000,'rate'); number(em.lifetimeSeconds,.001,60,'lifetimeSeconds'); number(em.durationSeconds,.001,native.durationSeconds,'durationSeconds');
    if (!['burst','rate'].includes(em.kind)||(em.kind==='burst'&&em.rate!==0)||(em.kind==='rate'&&em.count!==0)||(em.kind==='rate'&&Math.ceil(em.rate*(em.lifetimeSeconds+profile.budgets.maxUpdateSeconds))+2>em.capacity)) fail('Unbounded or mixed production emission.');
    if (em.capacity>native.maxParticles||em.capacity>profile.budgets.maxParticles) fail('Production particle capacity exceeds explicitly reserved native/profile layer limits.');
    number(c.size,.0001,1000,'size'); number(c.speed,0,10000,'speed'); number(c.maxTailSeconds,0,60,'maxTailSeconds');
    if(c.maxTailSeconds+em.durationSeconds>Math.min(profile.budgets.maxDurationSeconds,native.durationSeconds)) fail('Production lifetime/tail exceeds profile or native layer duration.');
    if(!['local','world'].includes(c.space)||!Array.isArray(c.color)||c.color.length!==4) fail('Explicit space and linear RGBA required.'); c.color.forEach(v=>number(v,0,1,'color'));
    const textures=native.resourceIds.filter(id=>resources.get(id).kind==='texture-png');
    if(textures.length>1||(textures.length===1&&c.resourceId!==textures[0])||(c.resourceId!==undefined&&(!native.resourceIds.includes(c.resourceId)||resources.get(c.resourceId)?.kind!=='texture-png'))) fail('Texture must match the single declared native resource slot.');
    const meshes=native.resourceIds.filter(id=>resources.get(id).kind==='mesh-glb');
    if(c.geometry) {
      fields(c.geometry,['kind','innerRadius','outerRadius','segments','resourceId'],'geometry');
      if(c.geometry.kind==='ring') { number(c.geometry.innerRadius,0,1000,'innerRadius'); number(c.geometry.outerRadius,.0001,1000,'outerRadius'); integer(c.geometry.segments,3,128,'segments'); if(c.geometry.innerRadius>=c.geometry.outerRadius) fail('Invalid ring radii.'); }
      else if(c.geometry.kind==='binding') { if(!meshes.includes(c.geometry.resourceId)) fail('Mesh geometry must bind the exact declared GLB.'); }
      else if(c.geometry.kind!=='plane') fail('Unsupported procedural geometry.');
    }
    if(meshes.length&&c.geometry?.kind!=='binding') fail('Declared mesh requires bounded reviewed host geometry; no substitute mesh is permitted.');
    if(c.family==='mesh'&&c.geometry?.kind!=='binding') fail('Mesh family requires reviewed geometry binding.');
    if(['ring','ground-indicator'].includes(c.family)&&c.geometry?.kind!=='ring') fail('Ring geometry required.');
    if(c.family==='beam'&&(c.resourceId||c.geometry)) fail('Initial beam uses its fixed owned untextured cylinder.');
    let historyPoints=0;
    if(c.family==='trail') { fields(c.trail,['historyPoints'],'trail'); historyPoints=integer(c.trail.historyPoints,2,256,'historyPoints'); if(historyPoints*em.capacity>native.maxTrailPoints||historyPoints*em.capacity>profile.budgets.maxTrailPoints) fail('Trail history reservation exceeds native/profile limits.'); if(c.speed!==0||c.space!=='world'||em.kind!=='burst'||em.count!==1) fail('Initial attached trail requires one stationary world-space particle; host transforms own the path.'); }
    else if(c.trail!==undefined) fail('History belongs only to trail layers.');
    const atlas=atlasByLayer.get(key);
    if(atlas&&atlas.metadata.resourceId!==c.resourceId) fail('Production texture must honor the native atlas binding.');
    if(c.family==='trail'&&atlas&&(atlas.metadata.frames.length!==1||atlas.layout.columns!==1||atlas.layout.rows!==1)) fail('Quarks 0.17.1 trail atlas supports a single complete cell only.');
    return {...c,native,atlas:atlas??null,historyPoints};
  });
  return deepFreeze({package:p,packageSha256,preparationSha256,profile,layers});
}

// Synchronous bounded SHA-256 for immutable geometry snapshots in both browser
// and Node. No host callback, dynamic import, decoder or network path is used.
export function sha256(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length>268435456) fail('Bounded bytes required for SHA-256.');
  const k=[],h=[]; for(let p=2;k.length<64;p++){let prime=true;for(let j=2;j*j<=p;j++)if(p%j===0){prime=false;break;}if(prime){if(h.length<8)h.push((Math.sqrt(p)%1*4294967296)|0);k.push((Math.cbrt(p)%1*4294967296)|0);}}
  const length=Math.ceil((bytes.length+9)/64)*64, data=new Uint8Array(length); data.set(bytes); data[bytes.length]=128;
  const view=new DataView(data.buffer),bits=bytes.length*8; view.setUint32(length-8,Math.floor(bits/4294967296));view.setUint32(length-4,bits>>>0);
  const w=new Int32Array(64),ror=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<length;off+=64){for(let i=0;i<16;i++)w[i]=view.getInt32(off+i*4);for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(ror(x,7)^ror(x,18)^(x>>>3))+w[i-7]+(ror(y,17)^ror(y,19)^(y>>>10)))|0;}let[a,b,c,d,e,f,g,z]=h;for(let i=0;i<64;i++){const t1=(z+(ror(e,6)^ror(e,11)^ror(e,25))+((e&f)^(~e&g))+k[i]+w[i])|0,t2=((ror(a,2)^ror(a,13)^ror(a,22))+((a&b)^(a&c)^(b&c)))|0;z=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}[a,b,c,d,e,f,g,z].forEach((x,i)=>h[i]=(h[i]+x)|0);}
  return h.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}

export function inspectVfxGeometry(geometry) {
  if(!geometry?.isBufferGeometry||geometry.isInstancedBufferGeometry||geometry.morphAttributes&&Object.keys(geometry.morphAttributes).length||geometry.groups?.length) fail('Only static ungrouped BufferGeometry is admitted.');
  const names=Object.keys(geometry.attributes).sort(); if(!names.includes('position')||names.some(name=>!['position','normal','uv'].includes(name))) fail('Unsupported geometry attributes.');
  const arrays=[]; let bytes=0,vertices=0;
  for(const name of [...names,'index']) { const a=name==='index'?geometry.index:geometry.attributes[name]; if(!a)continue;
    if(a.isInterleavedBufferAttribute||(name==='index'?!(a.array instanceof Uint16Array||a.array instanceof Uint32Array):!(a.array instanceof Float32Array))||a.normalized||a.count>1048576||a.itemSize!==(name==='uv'?2:name==='index'?1:3)) fail('Unsupported geometry buffer layout.');
    if(name==='position')vertices=a.count; if(name!=='index'&&a.count!==geometry.attributes.position.count)fail('Geometry attribute counts differ.');
    for(const value of a.array) { if(!Number.isFinite(value)||Math.abs(value)>1e9)fail('Invalid geometry coordinate/index.'); if(name==='index'&&(!Number.isInteger(value)||value<0||value>=geometry.attributes.position.count))fail('Geometry index out of bounds.'); }
    const header=new TextEncoder().encode(`${name}:${a.array.constructor.name}:${a.itemSize}:${a.count}\n`),raw=new Uint8Array(a.array.buffer,a.array.byteOffset,a.array.byteLength); arrays.push(header,raw);bytes+=raw.length;
  }
  const indices=geometry.index?.count??0; if(!vertices||(indices?indices:vertices)%3)fail('Geometry must contain complete triangles.');
  if(geometry.drawRange.start!==0||(geometry.drawRange.count!==Infinity&&geometry.drawRange.count!==(indices||vertices)))fail('Partial geometry draw ranges are unsupported.');
  const size=arrays.reduce((n,a)=>n+a.length,0); if(size>67108864)fail('Geometry digest envelope exceeded.');const buffer=new Uint8Array(size);let offset=0;for(const a of arrays){buffer.set(a,offset);offset+=a.length;}
  return Object.freeze({vertices,indices,bytes,sha256:sha256(buffer)});
}
