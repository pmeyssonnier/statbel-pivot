/* Pure shared axis utilities for Pivot SVG charts. */
(function (root) {
'use strict';
function ticks(min,max) {
 if (!Number.isFinite(min)||!Number.isFinite(max)) return [];
 if(min>max) [min,max]=[max,min];
 if(min===max) max=min+1;
 const raw=(max-min)/5,p=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/p;
 const step=(f<=1?1:f<=2?2:f<=5?5:10)*p;
 const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step,out=[];
 for(let v=lo,i=0;v<=hi+step/2&&i<100;v+=step,i++)out.push(+v.toFixed(10));
 return out;
}
function scaleOf(lo,hi,O) {
 O=O||{};
 const log = O.scale === 'log';
 if (log) {
   const low = Number.isFinite(O.ymin) ? O.ymin : lo;
   const high = Number.isFinite(O.ymax) ? O.ymax : hi;
   if (!(low > 0 && high > low)) return { invalid: 'Échelle logarithmique : les valeurs et bornes doivent être strictement positives.', tk: [], tmin: 1, tmax: 10, span: 1, cl: v => v, ratio: v => NaN };
   const tmin = low, tmax = high, span = Math.log10(high) - Math.log10(low);
   const tk = [];
   for (let k = Math.ceil(Math.log10(low)), end = Math.floor(Math.log10(high)); k <= end && tk.length < 40; k++) tk.push(10 ** k);
   if (!tk.length || tk[0] !== low) tk.unshift(low);
   if (tk[tk.length - 1] !== high) tk.push(high);
   return { tk, tmin, tmax, span, cl: v => Math.min(high, Math.max(low, v)), ratio: v => v > 0 ? (Math.log10(Math.min(high, Math.max(low, v))) - Math.log10(low)) / span : NaN };
 }
 let tk = ticks(lo,hi);
 if(!tk.length)return {tk:[],tmin:0,tmax:1,span:1,cl:v=>v,ratio:v=>Number.isFinite(v)?Math.min(1,Math.max(0,v)):NaN};
 let tmin=tk[0],tmax=tk[tk.length-1];
 if(Number.isFinite(O.ymin))tmin=O.ymin;
 if(Number.isFinite(O.ymax))tmax=O.ymax;
 if(!(tmin<tmax)){tmin=tk[0];tmax=tk[tk.length-1];}
 if (Number.isFinite(O.step) && O.step > 0) {
   const step = O.step, start = Math.ceil(tmin / step) * step;
   tk = [];
   if (Number.isFinite(start) && (tmax - tmin) / step <= 100) for (let i=0, v=start; v<=tmax+step*1e-9 && i<100; i++,v=start+i*step) tk.push(+v.toPrecision(12));
 } else tk=tk.filter(v=>v>=tmin-1e-9&&v<=tmax+1e-9);
 if(!tk.length||Math.abs(tk[0]-tmin)>1e-9)tk.unshift(tmin);
 if(Math.abs(tk[tk.length-1]-tmax)>1e-9&&Number.isFinite(O.ymax))tk.push(tmax);
 return {tk,tmin,tmax,span:tmax-tmin||1,cl:v=>Math.min(tmax,Math.max(tmin,v)),ratio:v=>(Math.min(tmax,Math.max(tmin,v))-tmin)/(tmax-tmin||1)};
}
const api={ticks,scaleOf};root.PivotChartAxis=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
