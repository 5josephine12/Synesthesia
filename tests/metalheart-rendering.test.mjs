import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';

// Baselines captured before optimization: exact paths, draw order, and paint
// settings at the original growth/retraction times and during continuous motion.
function load(source, capture) {
 class Path { constructor(){this.commands=[];} }
 for(const method of ['moveTo','lineTo','quadraticCurveTo','closePath']) Path.prototype[method]=function(...args){if(capture)this.commands.push([method,...args]);};
 const exports={};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Path2D:Path});
 return exports;
}
const particles=Array.from({length:12},(_,i)=>({id:i+1,artStyle:'style-3',midi:36+i*4,repeat:i%3,angle:i*.13,createdAt:i*20}));
function render(renderer, now, reducedMotion=false, capture=true) {
 const commands=[];const ctx=new Proxy({}, {set(o,k,v){if(capture)commands.push(['set',k,v]);o[k]=v;return true;},get(o,k){return o[k]??((...args)=>{if(capture)commands.push([k,...args.map(a=>a.commands??a)]);});}});
 renderer.drawMetalheartLayer(ctx,{particles,width:1440,height:900,now,reducedMotion,pulse:{progress:.2,strength:.8,x:.5,y:.5}});
 return JSON.stringify(commands);
}

const source=fs.readFileSync(new URL('../app/art-styles/style-3.ts',import.meta.url),'utf8');
const cases=JSON.parse(fs.readFileSync(new URL('./metalheart-motion.json',import.meta.url),'utf8'));
const renderer=load(source,true);
for(const frame of cases) {
 test(`Metalheart preserves motion at ${frame.now}ms (reduced motion: ${frame.reducedMotion})`,()=>{
  const actual=createHash('sha256').update(render(renderer,frame.now,frame.reducedMotion)).digest('hex');
  assert.equal(actual,frame.hash);
 });
}
