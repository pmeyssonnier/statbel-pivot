/* Pure trend estimators: least-squares linear/polynomial and trailing moving average. */
(function(root){'use strict';
const clean=points=>(points||[]).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
function polynomial(points,degree=1){
 const p=clean(points),n=p.length,d=Math.trunc(degree);
 if(![1,2,3].includes(d)||n<d+1)return null;
 const center=p.reduce((a,q)=>a+q.x,0)/n;
 const scale=Math.max(...p.map(q=>Math.abs(q.x-center)));
 if(!(scale>0))return null;
 const matrix=Array.from({length:d+1},(_,i)=>Array.from({length:d+2},(_,j)=>p.reduce((sum,q)=>{const z=(q.x-center)/scale;return sum+(j===d+1?q.y*z**i:z**(i+j));},0)));
 for(let i=0;i<=d;i++){
  let pivot=i;for(let k=i+1;k<=d;k++)if(Math.abs(matrix[k][i])>Math.abs(matrix[pivot][i]))pivot=k;
  if(Math.abs(matrix[pivot][i])<1e-10)return null;
  [matrix[i],matrix[pivot]]=[matrix[pivot],matrix[i]];
  const v=matrix[i][i];for(let j=i;j<=d+1;j++)matrix[i][j]/=v;
  for(let k=0;k<=d;k++)if(k!==i){const f=matrix[k][i];for(let j=i;j<=d+1;j++)matrix[k][j]-=f*matrix[i][j];}
 }
 const coefficients=matrix.map(row=>row[d+1]);
 const predict=x=>coefficients.reduce((sum,b,i)=>sum+b*((x-center)/scale)**i,0);
 const mean=p.reduce((s,q)=>s+q.y,0)/n;
 const ss=p.reduce((s,q)=>s+(q.y-mean)**2,0),err=p.reduce((s,q)=>s+(q.y-predict(q.x))**2,0);
 return {degree,coefficients,center,scale,r2:ss>0?Math.max(0,Math.min(1,1-err/ss)):null,n,predict};
}
function equation(fit,variable='x') {
 if(!fit)return '';
 const fmt=n=>Number(n.toPrecision(5)).toString();
 const terms=fit.coefficients.map((a,i)=>{const power=i===0?'':i===1?'z':'z^'+i;return (a<0?'− ':'+ ')+fmt(Math.abs(a))+(power?' × '+power:'');});
 return 'y = '+terms.join(' ').replace(/^\+ /,'')+' ; z = ('+variable+' − '+fmt(fit.center)+') / '+fmt(fit.scale);
}
function movingAverage(values,window=3){
 if(!Number.isInteger(window)||window<2||window>100)return [];
 return values.map((_,i)=>{if(i+1<window)return null;const v=values.slice(i+1-window,i+1);return v.every(Number.isFinite)?v.reduce((a,b)=>a+b,0)/window:null;});
}
const api={polynomial,movingAverage,equation};root.PivotChartTrend=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:window);
