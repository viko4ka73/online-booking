import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {findAvailableScan,findAvailableMasks} from '../src/slot-search.mjs';
import {baseInput,searchCases,generatedInput} from '../test-data/search-fixtures.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
mkdirSync('reports',{recursive:true});mkdirSync('examples/input',{recursive:true});mkdirSync('examples/output',{recursive:true});
let generatedPassed=0;
for(let seed=1;seed<=200;seed++){assert.deepEqual(findAvailableScan(generatedInput(seed)),findAvailableMasks(generatedInput(seed)),`seed=${seed}`);generatedPassed++;}
for(const [name,id] of [['01-free','FREE'],['02-occupied','OWN-OVERLAP'],['03-shared-halls','NEIGHBOR-DIRECTION'],['04-closed','CLOSED']]){
 const [,input,expected]=searchCases.find(row=>row[0]===id);
 const scan=findAvailableScan(input),masks=findAvailableMasks(input);assert.deepEqual(scan,expected);assert.deepEqual(masks,expected);
 writeFileSync(`examples/input/${name}.json`,JSON.stringify(input,null,2)+'\n');
 writeFileSync(`examples/output/${name}.json`,JSON.stringify({request:input.request,algorithmsAgree:true,slots:scan},null,2)+'\n');
}
function benchmarkData(size){
 const x=baseInput();x.request.sportId='football';x.openingHours={opensAt:480,closesAt:1380};
 x.courts=Array.from({length:size},(_,i)=>({id:i+1,sports:['football','tennis']}));
 for(const court of x.courts)for(let j=0;j<6;j++)x.bookings.push({courtId:court.id,date:x.request.date,startMinute:480+j*120,endMinute:540+j*120,sportId:(court.id+j)%2?'football':'tennis',status:'active'});
 for(let i=1;i<size;i+=2)x.adjacency.push({courtA:i,courtB:i+1,allowedPairs:[['football','football'],['tennis','tennis']]});
 return x;
}
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
const rows=[];
for(const size of [1,7,50,200]){
 const input=benchmarkData(size);const expected=findAvailableScan(input);assert.deepEqual(findAvailableMasks(input),expected);
 // Warm up each algorithm. Alternate measurement order to reduce order bias.
 findAvailableScan(input);findAvailableMasks(input);
 const scanTimes=[],maskTimes=[];
 for(let i=0;i<5;i++)for(const [fn,times] of i%2?[[findAvailableMasks,maskTimes],[findAvailableScan,scanTimes]]:[[findAvailableScan,scanTimes],[findAvailableMasks,maskTimes]]){
  const start=performance.now(),actual=fn(input);times.push(performance.now()-start);assert.deepEqual(actual,expected);
 }
 rows.push({courts:size,bookings:input.bookings.length,adjacencyEdges:input.adjacency.length,resultSlots:expected.length,scanMedianMs:median(scanTimes),masksMedianMs:median(maskTimes),scanSamplesMs:scanTimes,masksSamplesMs:maskTimes});
}
const report={sourceHash:createHash('sha256').update(readFileSync('src/slot-search.mjs')).digest('hex'),node:process.version,platform:os.platform(),architecture:os.arch(),generatedSchedules:generatedPassed,allAlgorithmsAgree:true,benchmark:{repetitions:5,warmup:1,rows,limitations:['Synthetic in-memory inputs; not a web-server or database load test.','Input validation and index construction are included.','Wall time fluctuates; no pass threshold is based on performance.','No claim about production latency or memory allocation.']}};
writeFileSync('reports/algorithms-comparison.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('reports/algorithms-comparison.csv','\uFEFFcourts;bookings;adjacency_edges;slots;scan_median_ms;masks_median_ms\n'+rows.map(r=>[r.courts,r.bookings,r.adjacencyEdges,r.resultSlots,r.scanMedianMs.toFixed(3),r.masksMedianMs.toFixed(3)].join(';')).join('\n')+'\n');
console.log(JSON.stringify(report,null,2));
