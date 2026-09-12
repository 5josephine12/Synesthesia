import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

function load(source) {
  const commands=[];
  class Path { constructor(){this.commands=[];} }
  for(const method of ['moveTo','arc']) Path.prototype[method]=function(...args){this.commands.push([method,...args]);};
  let canvasId=0;
  const document={createElement(){
    const id=canvasId++;
    const canvas={width:0,height:0,setAttribute(){}};
    const context=new Proxy({}, {
      set(target,key,value){commands.push([id,'set',key,value]);target[key]=value;return true;},
      get(target,key){
        if(key==='createRadialGradient') return (...args)=>{
          const gradient={stops:[]};commands.push([id,key,...args,gradient]);
          gradient.addColorStop=(...stop)=>gradient.stops.push(stop);return gradient;
        };
        return target[key]??((...args)=>commands.push([id,key,...args.map(arg=>arg?.commands??arg)]));
      },
    });
    canvas.getContext=()=>context;return canvas;
  }};
  const exports={};
  vm.runInNewContext(ts.transpileModule(source+'\nexport { DotCollisionGrid };',{ compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,document,window:{devicePixelRatio:2},Path2D:Path});
  return {renderer:exports,commands};
}
const particles=Array.from({length:12},(_,i)=>({id:i+1,artStyle:'style-4',midi:30+i*5,repeat:i%3,
  createdAt:i*30,x:.35+(i%4)*.09,y:.35+Math.floor(i/4)*.12,velocity:.45+(i%4)*.15,
  color:{h:i*29,s:85,l:62},accent:{h:220+i*5,s:60,l:70}}));
const configurations=[
  ...[0,80,400,900,1600,2300,2400].map(now=>({now,width:1440,height:900,reducedMotion:false})),
  {now:400,width:375,height:812,reducedMotion:false},
  {now:400,width:375,height:812,reducedMotion:true},
  {now:3000,width:1440,height:900,reducedMotion:false,frozen:true},
];
const source=fs.readFileSync(new URL('../app/art-styles/style-4.ts',import.meta.url),'utf8');
const baselinePath=new URL('./halftone-motion.json',import.meta.url);
const {renderer,commands}=load(source);
const results=configurations.map(options=>{
  commands.length=0;
  renderer.renderLiquidMetalFrame({...options,particles:options.frozen?particles.map(p=>({...p,frozenAt:700})):particles});
  return {...options,hash:createHash('sha256').update(JSON.stringify(commands)).digest('hex')};
});
const baselines=JSON.parse(fs.readFileSync(baselinePath,'utf8'));
for(let i=0;i<results.length;i++) test(`Halftone keeps exact geometry and paint for scenario ${i+1}`,()=>assert.deepEqual(results[i],baselines[i]));


test('Halftone collision memory is reused across sustained input and clears old dots',()=>{
  const grid=new renderer.DotCollisionGrid();
  for(let index=0;index<5000;index++) grid.add(index,index*20,100,2);
  const coordinates=grid.coordinates;
  const next=grid.next;
  assert.ok(next.length>=5000&&next.length<10000);
  for(let frame=0;frame<300;frame++) {
    grid.clear();
    assert.equal(grid.heads.size,0);
    assert.equal(grid.overlaps(0,0,100,2),false);
    for(let index=0;index<5000;index++) grid.add(index,index*20,100,2);
    assert.equal(grid.overlaps(0,0,100,2),true);
    assert.equal(grid.coordinates,coordinates);
    assert.equal(grid.next,next);
    assert.equal(grid.count,5000);
  }
});
