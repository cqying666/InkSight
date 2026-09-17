import assert from 'node:assert/strict';
import { creationStepPresentation } from '../src/components/creation/step-presentation';
import type { CreationStep } from '../src/lib/creation/types';
const step=(label:string,status:CreationStep['status']):CreationStep=>({id:Math.random().toString(),label,status,detail:status==='failed'?'原始失败原因':undefined});
const label='提炼核心梗与匹配框架';
const steps=[step(label,'failed'),step('理解目标与下一步','complete'),step(label,'complete')];
assert.equal(creationStepPresentation(steps,0).outcome,'首次失败，后续重试成功');
assert.equal(steps[0].status,'failed');assert.equal(steps[0].detail,'原始失败原因');
assert.equal(creationStepPresentation(steps,2).recovered,false);
for(const tail of [step(label,'running'),step(label,'failed'),step('检查素材关联、候选差异与硬约束','complete')])
 assert.equal(creationStepPresentation([steps[0],tail],0).recovered,false);
assert.equal(creationStepPresentation([step(label,'complete'),steps[0]],1).recovered,false);
assert.equal(creationStepPresentation([step('检索创作方法','failed'),step('检索创作方法','complete')],0).recovered,false);
assert.equal(creationStepPresentation([steps[0],step(label,'failed'),step(label,'complete')],1).outcome,'此次失败，后续重试成功');
assert.equal(creationStepPresentation([step('调整故事核并重新匹配框架','failed'),step('调整故事核并重新匹配框架','complete')],0).recovered,true);
console.log('creation step presentation: recovery, unresolved, ordering, other targets and immutable history passed');
