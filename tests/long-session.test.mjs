import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const aura = fs.readFileSync(new URL('../app/AuraToy.tsx', import.meta.url), 'utf8');
const historySource = fs.readFileSync(new URL('../app/particle-history.ts', import.meta.url), 'utf8');
const historyExports = {};
vm.runInNewContext(ts.transpileModule(historySource, {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports: historyExports});
const {ParticleHistory} = historyExports;
function particle(index) {
  return {id:index+1, artStyle:['aura','style-2','style-3','style-4'][index%4],
    color:{h:index%360+.125,s:83.3,l:64.7},accent:{h:222.7,s:48.6,l:77.3},
    shape:['bloom','ribbon','beam','arc'][index%4], note:`C${index%7}`,midi:36+index%60,
    repeat:Math.floor(index/60),compositionIndex:index,styleEpoch:Math.floor(index/80),
    x:.15+index%7*.1,y:.375,radius:.137,angle:-.275,stretch:2.3125,thickness:.287,
    curvature:-.542,velocity:.873,softness:.783,blendMode:index%2?'lighter':'source-over',createdAt:index*125};
}

test('packed history exactly preserves particles, frozen layers, and independent export snapshots', () => {
  const history=new ParticleHistory();
  const originals=Array.from({length:1025},(_,i)=>particle(i));
  originals[10].frozenAt=3456.789;
  originals.forEach(p=>history.append(p));
  history.freezeStyleFrom(128,'style-3',54321.123);
  originals.forEach((p,i)=>{if(i>=128&&p.artStyle==='style-3'&&p.frozenAt===undefined)p.frozenAt=54321.123;});
  const snapshot=history.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)),originals);
  history.freezeStyleFrom(0,'aura',70000);
  assert.equal(snapshot[0].frozenAt,undefined);
  history.clear();
  assert.equal(history.length,0);
  assert.equal(history.byteLength,0);
  assert.equal(snapshot.length,1025);
});

for (const style of ['mixed', 'aura', 'style-2', 'style-3', 'style-4']) {
test(`90-minute ${style} session keeps live history bounded even without animation frames`, t => {
  let now=0;
  const state={current:[]};
  const noop=()=>{};
  const context={clearRect:noop};
  const scope=vm.createContext({
    performance:{now:()=>now},blobsRef:state,artStyleRef:{current:style==='mixed'?'aura':style},reducedMotionRef:{current:false},
    width:1200,height:800,offscreen:{width:600},syncOffscreenSize:noop,
    settledCount:0,settledContext:context,settled:{width:600,height:400},
    historyCompositeContext:context,offscreenContext:context,pixelLayer:{},pixelContext:context,
    pixelAccents:{},pixelAccentContext:context,blurred:{},blurredContext:context,
    compactedHistoryActiveRef:{current:false},hasCompactedHistory:false,
    additiveLayerStartRef:{current:0},replayRenderStatesRef:{current:null},
    blurredSettledCount:0,blurredBlobCount:0,blurredFallbackArtStyle:null,
    lastPixelBlobCount:0,lastPixelFallbackArtStyle:null,
    visibleDottedIdsAcrossLayers:()=>new Set(),visibleTailIdsAcrossLayers:()=>new Set(),
    drawChronologicalAuraLayers:noop,
    MAX_LIVE_VISUAL_PARTICLES:48,HARD_MAX_LIVE_VISUAL_PARTICLES:72,VISUAL_COMPACTION_BATCH_SIZE:2,
    METALHEART_VISIBLE_FORMATIONS:12,METALHEART_FORMATION_DURATION:620,LIQUID_METAL_FORMATION_DURATION:1900,
    DOTTED_GLOW_MATURATION_DURATION:7200,BLOB_ARRIVAL_DURATION:550,
  });
  const start=aura.indexOf('    const compactVisualHistory =');
  const end=aura.indexOf('    const animate =',start);
  vm.runInContext(ts.transpileModule(aura.slice(start,end)+'\nglobalThis.maintain=maintainHiddenHistory;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022},
  }).outputText,scope);
  const history=new ParticleHistory();
  const count=90*60*8; // Two graphics per beat at 240 BPM.
  let maximum=0;
  for(let i=0;i<count;i++) {
    now=i*125;
    const p=particle(i);
    if(style!=='mixed') p.artStyle=style;
    if(style==='mixed'&&i%80===0) state.current.forEach(old=>{old.frozenAt=now;});
    state.current.push(p);history.append(p);
    if(state.current.length>72) scope.maintain();
    maximum=Math.max(maximum,state.current.length);
    assert.ok(state.current.length<=72,`unbounded queue at event ${i}`);
  }
  assert.equal(history.length,count);
  assert.ok(history.byteLength<9*1024*1024);
  const snapshot=history.snapshot();
  assert.equal(snapshot.length,count);
  assert.equal(snapshot.at(-1).id,count);
  t.diagnostic(`${count} graphics / 90 simulated minutes; max ${maximum} live objects; ${(history.byteLength/1024/1024).toFixed(2)} MiB packed export history`);
});
}

test('overlay identifiers remain bounded throughout continuous input', () => {
  const source=fs.readFileSync(new URL('../app/art-styles/telemetry.ts',import.meta.url),'utf8');
  const start=source.indexOf('  const activeKeys = new Set(active.map(nodeKey));');
  const end=source.indexOf('  context.save();',start);
  assert.ok(start>=0&&end>start);
  const prune=new Function('processedNodeKeys','active','nodeKey',source.slice(start,end));
  const processed=new Set();
  for(let i=0;i<43200;i++) {
    const active=Array.from({length:Math.min(i+1,48)},(_,j)=>({id:i-j}));
    prune(processed,active,node=>String(node.id));
    active.forEach(node=>processed.add(String(node.id)));
    assert.ok(processed.size<=48);
  }
});
