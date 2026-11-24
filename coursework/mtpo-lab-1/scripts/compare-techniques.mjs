import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {NOW,DATE_ERROR,HORIZON_ERROR,originalCases} from '../test-data/schedule-cases.mjs';
import {mergeCases} from '../test-data/merge-cases.mjs';
import {coverageItems,reachedItems} from '../test-data/coverage-items.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const source=readFileSync('src/booking.ts','utf8').split('\n');
const first=source.findIndex(line=>line.startsWith('export function scheduleError'))+1;
const last=source.findIndex((line,i)=>i>=first&&line==='}')+1;
function percentage(items){return {covered:items.filter(item=>item.count>0).length,total:items.length,percent:items.length?100*items.filter(item=>item.count>0).length/items.length:null};}
const rows=[];
for(const profile of ['statement','branch','equivalence','boundary','original','optimized']){
 const dir=`reports/comparison/${profile}`;mkdirSync(dir,{recursive:true});
 const files=['tests/schedule.test.mjs'];if(['original','optimized'].includes(profile))files.push('tests/availability.test.mjs');
 const args=['--test','--experimental-test-coverage','--test-coverage-include=src/booking.ts','--test-reporter=spec','--test-reporter=./scripts/json-reporter.mjs','--test-reporter-destination=stdout',`--test-reporter-destination=${dir}/reporter.txt`,...files];
 const run=spawnSync(process.execPath,args,{encoding:'utf8',env:{...process.env,LAB_CASE_PROFILE:profile,LAB_REPORT_DIR:dir}});
 writeFileSync(`${dir}/test-run.txt`,(run.stdout??'')+(run.stderr??''));
 if(run.status!==0)throw new Error(`Profile ${profile} failed: ${run.stderr}\n${run.stdout}`);
 const result=JSON.parse(readFileSync(`${dir}/results.json`,'utf8'));
 const coverage=result.coverage.files.find(f=>f.path.endsWith('booking.ts'));
 const selected=profile==='original'?originalCases:profile==='optimized'?mergeCases(originalCases).map(c=>[c.ids.join('+'),c.techniques.join(','),c.date,c.duration,c.expected]):originalCases.filter(c=>c[1]===profile);
 
 const outer=new Set();
 for(const row of selected){
  const expected=row[4];outer.add('date:'+String(expected===DATE_ERROR));
  if(expected===DATE_ERROR)continue;
  outer.add('horizon:'+String(expected===HORIZON_ERROR));if(expected===HORIZON_ERROR)continue;
  outer.add('duration:'+String(expected!==null));
 }
 const criteria=[...new Set(selected.flatMap(reachedItems))].sort();
 rows.push({specificationItems:{ids:criteria,covered:criteria.length,total:coverageItems.length,percent:100*criteria.length/coverageItems.length},profile,validationCases:selected.length,totalTests:result.summary.counts.tests,passed:result.summary.counts.passed,scope:{function:'scheduleError',firstLine:first,lastLine:last},lines:percentage(coverage.lines.filter(x=>x.line>=first&&x.line<=last)),v8Branches:percentage(coverage.branches.filter(x=>x.line>=first&&x.line<=last)),outerDecisions:{covered:outer.size,total:6,percent:100*outer.size/6},wholeModule:result.coverage.totals});
 console.log(profile,JSON.stringify(rows.at(-1)));
}
const merged=mergeCases(originalCases);
const result={nodeVersion:process.version,fixedClock:NOW.toISOString(),coverageItems,rows,optimization:{originalCases:originalCases.length,uniqueCases:merged.length,removed:originalCases.length-merged.length,sourceIdsPreserved:merged.flatMap(c=>c.ids).length},traceability:merged.map(c=>({...c,dateType:typeof c.date,durationType:typeof c.duration,date:String(c.date),duration:typeof c.duration==='number'&&!Number.isFinite(c.duration)?String(c.duration):c.duration})),limitations:['V8 line and branch counts are tool-specific and are not AST statement coverage or MCDC.','Profiles are compared on scheduleError only; original/optimized full runs additionally include availability tests.','The snapshot uses database doubles. SQL semantics and concurrency were not tested.','No work-time hours were measured; effort estimates are qualitative.','Observed V8 branch denominators differ across separate profile runs. Do not rank techniques by their V8 percentages; compare the fixed 15 specification items and the 6 outer decision outcomes.']};
writeFileSync('reports/comparison.json',JSON.stringify(result,null,2));
const csv=[['profile','validation_cases','total_tests','passed','function_lines_covered','function_lines_total','function_lines_percent','v8_branches_covered','v8_branches_total','v8_branches_percent','outer_decisions_covered','outer_decisions_total','spec_items_covered','spec_items_total','spec_items_percent'],...rows.map(r=>[r.profile,r.validationCases,r.totalTests,r.passed,r.lines.covered,r.lines.total,r.lines.percent.toFixed(2),r.v8Branches.covered,r.v8Branches.total,r.v8Branches.percent.toFixed(2),r.outerDecisions.covered,6,r.specificationItems.covered,r.specificationItems.total,r.specificationItems.percent.toFixed(2)])];
writeFileSync('reports/comparison.csv','\uFEFF'+csv.map(r=>r.join(';')).join('\n')+'\n');
writeFileSync('reports/traceability.json',JSON.stringify(result.traceability,null,2));
