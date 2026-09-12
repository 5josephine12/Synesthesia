import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../app/automatic-composition.ts',import.meta.url),'utf8');
const exports={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
const {AutomaticComposition}=exports;
function play(director,{duration=60000,level=.65,midi=60,bass=42,interval=500,start=0,style=0,overlay=false}={}) {
  const changes=[];
  for(let time=0;time<=duration;time+=50) {
    director.observeAudio(start+time,true,level,midi,bass);
    if(time%interval)continue;
    const decision=director.note(start+time,midi,.8,style,overlay);
    if(decision){changes.push({time:start+time,...decision});style=decision.style;overlay=decision.overlay;}
  }
  return {changes,style,overlay};
}

test('automatic mode starts off and stops without changing the current composition',()=>{
  const director=new AutomaticComposition();
  assert.equal(director.note(10000,48,.9,0,false),null);
  director.start(0,false);assert.equal(director.enabled,true);
  play(director,{duration:8000});director.stop();
  for(let now=9000;now<60000;now+=500) assert.equal(director.note(now,48,.9,2,true),null);
  assert.equal(director.enabled,false);
});

test('style choices visit all four, land on notes, and allow 5–10 seconds per passage',()=>{
  const director=new AutomaticComposition();director.start(0,false);
  const {changes}=play(director);
  const styles=[0];let lastChange=0;
  for(const change of changes){
    assert.equal(change.time%500,0);
    if(change.style===styles.at(-1))continue;
    assert.ok(change.time-lastChange>=5000&&change.time-lastChange<=10000);
    styles.push(change.style);lastChange=change.time;
  }
  assert.ok(styles.length>6);
  assert.equal(new Set(styles.slice(0,4)).size,4);
  assert.ok(changes.some(change=>change.overlay));
  assert.ok(changes.some((change,index)=>index>0&&changes[index-1].overlay&&!change.overlay));
});

test('audio character influences the choice instead of a fixed rotation',()=>{
  const low=new AutomaticComposition();low.start(0,false);
  const high=new AutomaticComposition();high.start(0,false);
  const lowChange=play(low,{duration:10000,level:.95,midi:40,bass:30}).changes[0];
  const highChange=play(high,{duration:10000,level:.55,midi:84,bass:null,interval:250}).changes[0];
  assert.equal(lowChange.style,2);
  assert.equal(highChange.style,1);
});

test('silence and a long background pause do not trigger catch-up switches',()=>{
  const director=new AutomaticComposition();director.start(0,false);
  play(director,{duration:2000});
  const before=director.activeTime;
  for(let now=2050;now<=90000;now+=50)director.observeAudio(now,false,0,null,null);
  assert.equal(director.activeTime,before);
  director.observeAudio(90050,true,.7,60,42);
  assert.equal(director.note(90050,60,.8,0,false),null);
  director.pause();
  director.observeAudio(180000,true,.7,60,42);
  assert.equal(director.note(180000,60,.8,0,false),null);
});

test('manual choices remain temporary and get a full passage before automatic changes resume',()=>{
  const director=new AutomaticComposition();director.start(0,false);
  play(director,{duration:6000});director.manualStyle(3);
  const result=play(director,{start:6050,duration:5000,style:3});
  assert.equal(director.enabled,true);
  assert.equal(result.style,3);
  director.manualOverlay(true);
  assert.equal(director.overlayEndsAt,director.activeTime+6500);
});

test('keyboard and MIDI notes work without capture and chord companions cannot double-step',()=>{
  const director=new AutomaticComposition();director.start(0,false);
  let style=0,overlay=false,changes=0;
  for(let now=0;now<=30000;now+=500){
    const decision=director.note(now,60,.8,style,overlay);
    if(decision){style=decision.style;overlay=decision.overlay;changes++;}
    assert.equal(director.note(now,64,.8,style,overlay),null);
    assert.equal(director.note(now+20,67,.8,style,overlay),null);
  }
  assert.ok(changes>=3);
});

const aura=fs.readFileSync(new URL('../app/AuraToy.tsx',import.meta.url),'utf8');
function shortcut(desktop=true) {
  const start=aura.indexOf('    const handleFeatureShortcut =');
  const end=aura.indexOf('\n    window.addEventListener("keydown", handleFeatureShortcut',start);
  class Element {closest(){return false;}}
  const calls=[];
  const scope={HTMLElement:Element,HTMLInputElement:class extends Element{},HTMLTextAreaElement:class extends Element{},
    previewKind:null,microphonePromptOpen:false,automaticDesktopRef:{current:desktop},
    toggleAutomaticComposition:()=>calls.push('toggle'),window:{matchMedia:()=>({matches:desktop})}};
  vm.runInNewContext(ts.transpileModule(aura.slice(start,end)+'\nglobalThis.handle=handleFeatureShortcut;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022},
  }).outputText,scope);
  return {scope,calls,event:(overrides={})=>({key:'A',shiftKey:true,repeat:false,metaKey:false,altKey:false,ctrlKey:false,
    target:null,preventDefault:()=>calls.push('prevent'),stopImmediatePropagation:()=>calls.push('stop'),...overrides})};
}

test('the hidden desktop shortcut consumes Shift+A before the piano, with typing and modifier guards',()=>{
  const {scope,calls,event}=shortcut();
  scope.handle(event());assert.deepEqual(calls,['prevent','stop','toggle']);
  for(const overrides of [{repeat:true},{metaKey:true},{ctrlKey:true},{altKey:true},{target:new scope.HTMLInputElement()}]){
    calls.length=0;scope.handle(event(overrides));assert.equal(calls.length,0);
  }
  calls.length=0;const editable=new scope.HTMLElement();editable.closest=()=>true;
  scope.handle(event({target:editable}));assert.equal(calls.length,0);
  const mobile=shortcut(false);mobile.scope.handle(mobile.event());assert.equal(mobile.calls.length,0);
  assert.doesNotMatch(aura,/Shift\s*\+\s*A/);
});


test('automatic selections commit style and TouchDesigner indicators together, only when changed',()=>{
  const start=aura.indexOf('    automaticNoteRef.current =');
  const end=aura.indexOf('    return () => { automaticNoteRef.current = null;',start);
  let next={style:2,overlay:true};
  const calls=[];
  const scope={
    automaticNoteRef:{current:null},automaticDesktopRef:{current:true},automaticSuspendedRef:{current:false},
    document:{hidden:false},ART_STYLE_SLOTS:[{id:'aura'},{id:'style-2'},{id:'style-3'},{id:'style-4'}],
    artStyleRef:{current:'aura'},telemetryRef:{current:false},
    automaticCompositionRef:{current:{note:()=>next}},
    flushSync:callback=>{calls.push('commit-start');callback();calls.push('commit-end');},
    selectArtStyleByIndex:(index,automatic)=>{calls.push(['style',index,automatic]);scope.artStyleRef.current=scope.ART_STYLE_SLOTS[index].id;},
    setTelemetry:value=>calls.push(['overlay',value]),
    clearCanvasArtwork:()=>calls.push('clear-artwork'),indicateCanvasReset:()=>calls.push('reset-light'),
  };
  vm.runInNewContext(ts.transpileModule(aura.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,scope);
  scope.automaticNoteRef.current(8000,48,.8);
  assert.deepEqual(calls,['commit-start',['style',2,true],['overlay',true],'commit-end']);
  assert.equal(scope.telemetryRef.current,true);
  calls.length=0;next={style:2,overlay:false};
  scope.automaticNoteRef.current(14000,48,.8);
  assert.deepEqual(calls,['commit-start',['overlay',false],'commit-end']);
  assert.equal(scope.telemetryRef.current,false);
  calls.length=0;next={style:3,overlay:false,reset:true};
  scope.automaticNoteRef.current(60000,48,.8);
  assert.deepEqual(calls,['commit-start','clear-artwork','reset-light',['style',3,true],'commit-end']);
  calls.length=0;next=null;scope.automaticNoteRef.current(60500,48,.8);
  assert.deepEqual(calls,[]);
});


test('fresh canvases happen once per active minute on notes and leave automatic mode running',()=>{
  const director=new AutomaticComposition();director.start(0,false);
  const {changes}=play(director,{duration:181000});
  assert.deepEqual(changes.filter(change=>change.reset).map(change=>change.time),[60000,120000,180000]);
  assert.equal(director.enabled,true);
  assert.equal(director.note(181020,67,.8,changes.at(-1).style,false),null);
});

test('silence does not advance the fresh-canvas countdown',()=>{
  const director=new AutomaticComposition();director.start(0,false);
  const first=play(director,{duration:30000});
  for(let now=30050;now<=90000;now+=50)director.observeAudio(now,false,0,null,null);
  const resumed=play(director,{start:90050,duration:31000,style:first.style,overlay:first.overlay});
  assert.deepEqual(resumed.changes.filter(change=>change.reset).map(change=>change.time),[120050]);
});

test('clearing artwork resets retained graphics without touching audio or held notes',()=>{
  const start=aura.indexOf('  const clearCanvasArtwork =');
  const end=aura.indexOf('  const indicateCanvasReset =',start);
  const heldNotes=new Set(['C3']);
  const microphone={active:true};
  let clearedHistory=false,resetRenderer=false;
  const scope={useCallback:callback=>callback,
    blobsRef:{current:[{id:7}]},artworkHistoryRef:{current:{clear:()=>{clearedHistory=true;}}},
    activeHistoryStartRef:{current:50},exportSnapshotRef:{current:{}},blobIdRef:{current:8},
    noteRepeatRef:{current:new Map([['C3',4]])},artStyleLayerCountRef:{current:{aura:50}},
    styleLayerEpochRef:{current:7},colorRebuildLayersRef:{current:5},additiveLayerStartRef:{current:2},
    resetRendererRef:{current:()=>{resetRenderer=true;}},
    heldToneKeysRef:{current:heldNotes},microphoneRef:{current:microphone},
    disposeToneEngine:()=>assert.fail('canvas resets must not dispose audio'),
  };
  vm.runInNewContext(ts.transpileModule(aura.slice(start,end)+'\nglobalThis.clear=clearCanvasArtwork;',{
    compilerOptions:{target:ts.ScriptTarget.ES2022},
  }).outputText,scope);
  scope.clear();
  assert.equal(scope.blobsRef.current.length,0);
  assert.equal(clearedHistory,true);assert.equal(resetRenderer,true);
  assert.equal(scope.exportSnapshotRef.current,null);
  assert.equal(scope.noteRepeatRef.current.size,0);
  assert.equal(scope.styleLayerEpochRef.current,0);
  assert.deepEqual([...heldNotes],['C3']);assert.equal(scope.microphoneRef.current,microphone);
});
