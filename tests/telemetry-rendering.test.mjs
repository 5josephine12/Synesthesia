import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../app/art-styles/telemetry.ts', import.meta.url), 'utf8');
function harness() {
  const calls=[];
  const context=new Proxy({canvas:{width:2880,height:1800},measureText:text=>({width:text.length*6})}, {
    get(target,key) {return target[key] ?? (target[key]=(...args)=>{calls.push([key,...args]);});},
  });
  const exports={};
  const probe='\nexport const inspect = () => ({states:morphStates, keys:processedNodeKeys.size, compositionMode});\nexport {drawFrameAsset, drawPanelNodeNetwork, drawVisualizerConnection, interpolatePresentation, smootherStep};';
  vm.runInNewContext(ts.transpileModule(source+probe, {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports,require:()=>({dottedSigilBounds:()=>({width:100,height:100})}),
    document:{createElement:()=>({width:0,height:0,getContext:()=>context})},
  });
  return {renderer:exports,context,calls,draw:(nodes,now)=>exports.drawTelemetryOverlay(context,nodes,1440,900,now)};
}
function node(id,createdAt) {
  return {id,createdAt,artStyle:'aura',note:'C3',midi:48+(id%3)*2,velocity:.8,color:{h:150,s:80,l:60},
    shape:'bloom',repeat:0,x:.2+(id%3)*.25,y:.3,radius:.08,angle:0,stretch:1,thickness:.3,curvature:.4,softness:.6};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('replacing a viewer preserves its displayed geometry and entrance opacity',()=>{
  const {renderer,draw}=harness();
  const nodes=[node(1,0),node(2,250),node(3,500)];
  draw(nodes,1000);
  const before=renderer.inspect().states[0];
  const expected=renderer.interpolatePresentation(before.from,before.to,renderer.smootherStep(100/before.duration));
  nodes.push(node(4,1100));draw(nodes,1100);
  const replacement=renderer.inspect().states.find(s=>s.to.node.id===4);
  assert.deepEqual(plain(replacement.from),plain(expected));
  assert.deepEqual(plain(replacement.to.pose),plain(before.to.pose));
  assert.equal(replacement.sessionStartedAt,before.sessionStartedAt);
});

test('a viewer cable has one smooth route and exactly two endpoint ports',()=>{
  const {renderer,context,calls,draw}=harness();
  draw([node(1,0),node(2,250)],1000);
  const [a,b]=renderer.inspect().states;
  calls.length=0;
  renderer.drawPanelNodeNetwork(context,a.to,b.to,1,1);
  assert.equal(calls.filter(c=>c[0]==='bezierCurveTo').length,1);
  const ports=calls.filter(c=>c[0]==='arc');
  assert.equal(ports.length,2);
  const start=calls.find(c=>c[0]==='moveTo').slice(1);
  const end=calls.find(c=>c[0]==='bezierCurveTo').slice(-2);
  assert.deepEqual(start,ports[0].slice(1,3));
  assert.deepEqual(end,ports[1].slice(1,3));
  assert.equal(context.lineCap,'butt');
  for(const port of ports) assert.ok(port.slice(1).every(Number.isFinite));
});

test('continuous input keeps three distinct viewers, and bounded identifiers',()=>{
  const {renderer,draw,calls}=harness();
  const active=[];
  for(let i=0;i<1200;i++) {
    const now=i*125;
    active.push(node(i,now));
    if(active.length>60) active.shift();
    calls.length=0;draw(active,now);
    assert.ok(renderer.inspect().states.length<=3);
    assert.ok(renderer.inspect().keys<=60);
    assert.ok(calls.filter(c=>c[0]==='drawImage').length<=8);
  }
  draw([],200000);
  assert.equal(renderer.inspect().states.length,0);
  assert.equal(renderer.inspect().keys,0);
  assert.equal(renderer.telemetryNextFrameAt(200000),Infinity);
});


test('frame connectors terminate precisely on moving borders on every side',()=>{
  const {renderer,context,calls}=harness();
  const onBorder=(point,rect)=>{
    const [x,y]=point;
    const epsilon=1e-8;
    assert.ok(x>=rect.x-epsilon&&x<=rect.x+rect.width+epsilon);
    assert.ok(y>=rect.y-epsilon&&y<=rect.y+rect.height+epsilon);
    assert.ok(Math.min(Math.abs(x-rect.x),Math.abs(x-rect.x-rect.width),
      Math.abs(y-rect.y),Math.abs(y-rect.y-rect.height))<epsilon);
  };
  for(const [dx,dy] of [[-400,0],[400,0],[0,-400],[0,400],[-400,-260],[400,260]]) {
    for(let step=0;step<=20;step++) {
      const t=step/20;
      const frame={x:500+t*13.3,y:500+t*7.7,width:160+t*60,height:120+t*30,angle:0};
      Object.assign(frame,{centerX:frame.x+frame.width/2,centerY:frame.y+frame.height/2,
        halfWidth:frame.width/2,halfHeight:frame.height/2});
      const viewport={x:frame.centerX+dx,y:frame.centerY+dy,width:90.25,height:70.75};
      calls.length=0;
      renderer.drawVisualizerConnection(context,frame,{viewport},1,1);
      const curveIndex=calls.findIndex(c=>c[0]==='bezierCurveTo');
      onBorder(calls[curveIndex-1].slice(1),frame);
      onBorder(calls[curveIndex].slice(-2),viewport);
      assert.equal(context.lineCap,'butt');
    }
  }
});


test('panel entrances and replacements keep their borders and cables stationary',()=>{
  const {renderer,draw}=harness();
  const nodes=[node(1,0),node(2,1),node(3,2)];
  draw(nodes,10);
  const poses=renderer.inspect().states.map(state=>plain(state.to.pose));
  for(const state of renderer.inspect().states) {
    assert.deepEqual(plain(state.from),plain(state.to));
  }
  for(let id=4;id<30;id++) {
    const event={...node(id,id*300),x:id%2 ? .1 : .9,radius:id%2 ? .03 : .2};
    nodes.push(event);draw(nodes,event.createdAt);
    const state=renderer.inspect().states.find(state=>state.to.node.id===id);
    assert.deepEqual(plain(state.from.pose),poses[state.panelVariant]);
    assert.deepEqual(plain(state.to.pose),poses[state.panelVariant]);
    assert.equal(state.to.node.id,id);
  }
});

test('large tracking frames fade at their actual locations without crossing the artwork',()=>{
  const {renderer,context,calls,draw}=harness();
  draw([node(1,0),{...node(2,1),x:.9,radius:.2}],1000);
  const [a,b]=renderer.inspect().states;
  const from=a.to;
  const to={...b.to,pose:from.pose};
  const rect=frame=>[frame.x,frame.y,frame.width,frame.height];
  for(const progress of [0,.1,.25,.5,.75,.9,1]) {
    calls.length=0;
    const current=renderer.interpolatePresentation(from,to,progress);
    renderer.drawFrameAsset(context,from,to,current,null,0,progress,1,true,1,1);
    const outlines=calls.filter(call=>call[0]==='strokeRect').map(call=>call.slice(1));
    assert.ok(outlines.length>=1&&outlines.length<=2);
    for(const outline of outlines) {
      assert.ok([rect(from.frame),rect(to.frame)].some(expected=>
        expected.every((value,index)=>value===outline[index])));
    }
  }
});
