import {mkdirSync,writeFileSync} from 'node:fs';
export default async function* reporter(source){
 const result={nodeVersion:process.version,executedAt:new Date().toISOString(),tests:[],summary:null,coverage:null};
 for await(const event of source){
  if(event.type==='test:pass'||event.type==='test:fail')result.tests.push({name:event.data.name,status:event.type==='test:pass'?'passed':'failed'});
  if(event.type==='test:summary')result.summary=event.data;
  if(event.type==='test:coverage')result.coverage=event.data.summary;
 }
 const dir=process.env.LAB_REPORT_DIR??'reports';mkdirSync(dir,{recursive:true});
 writeFileSync(dir+'/results.json',JSON.stringify(result,null,2));
 yield `Saved ${result.tests.length} test outcomes to reports/results.json\n`;
}
