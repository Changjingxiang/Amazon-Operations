const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../web/ad-review/review-core.js');
const model = {modelName:'QA夹克',parentAsin:'B0DEMO0001',countryCode:'CA',legacyParentAsins:['B0OLD00001']};
const watches = [{modelName:model.modelName,keyword:'demo jacket',enabled:true}];
const report = () => ({type:'keyword-ad-review',schemaVersion:1,runId:'qa-monday',analysisDate:'2026-09-21',slot:'monday_am',dataStart:'2026-08-22',dataEnd:'2026-09-20',summary:'合成测试，请勿用于广告操作',sources:['synthetic'],goals:[{countryCode:'CA',parentAsin:model.parentAsin,confirmed:true,confirmedAt:'2026-09-21T01:00:00Z',text:'测试目标'}],items:[{itemId:'qa-word',countryCode:'CA',parentAsin:model.parentAsin,keyword:'demo jacket',strategy:'排名优先',recommendation:'合成测试：观察',evidence:'合成证据',confidence:'低',review:'周四复盘',budget:'预算周期待确认',dayparting:'缺少小时数据',actions:[{campaign:'qa',adGroup:'qa-group',match:'exact',currentBid:1,proposedBid:1.04,bidDate:'2026-09-20',instruction:'仅UI测试'}]}]});
test('strict product/keyword identity and alias matching',()=>{
 assert.equal(core.preview(report(),[model],watches).valid,true);
 assert.equal(core.preview(report(),[{...model,countryCode:'US'}],watches).valid,false);
 assert.equal(core.preview(report(),[model],[{...watches[0],keyword:'jacket demo'}]).valid,false);
 assert.equal(core.preview(report(),[model],[{...watches[0],enabled:false}]).valid,false);
 const r=report();r.items[0].parentAsin=r.goals[0].parentAsin='B0OLD00001';
 assert.equal(core.preview(r,[model],watches).valid,true);
});
test('malformed reports and unconfirmed goals rejected',()=>{
 for(const mutate of [r=>r.goals[0].confirmed=false,r=>r.items.push({...r.items[0]}),r=>r.dataEnd='2026-09-22',r=>r.items[0].actions[0].proposedBid='1.2',r=>r.items[0].actions[0].bidDate='2026-09-23']) {
  const r=report();mutate(r);assert.throws(()=>core.validate(r));
 }
});
test('duplicate id is idempotent; changed contents cannot replace it',()=>{
 const r=report();assert.equal(core.preview(r,[model],watches,[r]).duplicate,true);
 const changed=report();changed.items[0].recommendation='different';
 assert.throws(()=>core.preview(changed,[model],watches,[r]),/runId/);
});
test('Monday and Thursday preserve independent adoption even on same anchor',()=>{
 const monday=report(),thursday={...report(),runId:'qa-thursday',slot:'thursday_pm',analysisDate:'2026-09-24',dataEnd:'2026-09-23'};
 const state={reports:[monday,thursday],decisions:[{runId:monday.runId,itemId:'qa-word',accepted:true}]};
 const entries=core.entries(state,model,' Demo  Jacket ');
 assert.equal(entries[0].report.runId,'qa-thursday');assert.equal(entries[0].accepted,false);assert.equal(entries[1].accepted,true);
 assert.equal(core.anchor(thursday,['2026-09-18','2026-09-20','2026-09-25']),'2026-09-20');
 assert.deepEqual(core.entries(state,{...model,kind:'competitor'}),[]);
 assert.equal(core.anchor(monday,['2026-09-25']),null);
});
test('incoming acceptance cannot masquerade as user adoption',()=>{
 const r=report();r.items[0].accepted=true;
 assert.equal(core.validate(r).items[0].accepted,undefined);
});
module.exports={model,watches,report};
