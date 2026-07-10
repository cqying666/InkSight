"use client";

import type { CharacterAnalysis } from "@/lib/analysis/schema";

/**
 * 人设分析报告 — 7 部分渲染
 *
 * 1. 人物清单与分级
 * 2. 人设机制表
 * 3. 人物小传
 * 4. 可复用人设卡
 * 5. 人物关系资产
 * 6. 入库总表
 * 7. 质量自检
 */

// ===== 通用小组件（与 PlotReport 共享设计语言）=====

function SectionHeader({ num, title }: { num: string; title: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-3 border-b border-border pb-2">
      <span className="font-mono text-sm font-bold text-accent">{num}</span>
      <h3 className="font-display text-lg font-bold text-text">{title}</h3>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-sm">
      <span className="shrink-0 text-text-muted">{label}：</span>
      <span className="flex-1 leading-relaxed text-text">{value}</span>
    </div>
  );
}

function ListBlock({ items, title }: { items: string[]; title?: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      {title && <div className="mb-1 text-xs text-text-muted">{title}</div>}
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-text">
            <span className="mt-0.5 text-accent">·</span>
            <span className="flex-1 leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-border bg-surface p-4 ${className}`}>
      {children}
    </div>
  );
}

const TIER_COLOR: Record<string, string> = {
  "核心人物": "border-accent bg-accent/10 text-accent",
  "关键配角": "border-info bg-info/10 text-info",
  "功能人物": "border-border bg-bg-soft text-text-muted",
  "可忽略人物": "border-border bg-bg-soft text-text-muted",
};

// ===== 1. 人物清单与分级 =====

function CharacterList({ data }: { data: CharacterAnalysis["characterList"] }) {
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="书名" value={data.bookName} />
          <Field label="题材" value={data.genre} />
          <Field label="总人物数" value={data.totalCharacters} />
        </div>
        <Field label="核心人物吸引力" value={data.coreCharacterAttraction} />
      </Card>

      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">人物清单</div>
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-soft text-xs text-text-muted">
                <th className="px-3 py-2 text-left font-normal">姓名</th>
                <th className="px-3 py-2 text-left font-normal">叙事角色</th>
                <th className="px-3 py-2 text-left font-normal">动作角色</th>
                <th className="px-3 py-2 text-left font-normal">故事功能</th>
                <th className="px-3 py-2 text-left font-normal">分级</th>
              </tr>
            </thead>
            <tbody>
              {data.characters.map((c, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-semibold text-text">{c.name}</td>
                  <td className="px-3 py-2 text-text-muted">{c.narrativeRole}</td>
                  <td className="px-3 py-2 text-text-muted">{c.actionRole}</td>
                  <td className="px-3 py-2 text-text-muted">{c.storyFunction}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${TIER_COLOR[c.tier] || TIER_COLOR["功能人物"]}`}>
                      {c.tier}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ===== 2. 人设机制表 =====

function MechanismTables({ data }: { data: CharacterAnalysis["mechanismTables"] }) {
  return (
    <div className="space-y-5">
      {data.map((m, i) => (
        <Card key={i}>
          <div className="mb-3 flex items-center justify-between">
            <span className="font-display text-base font-bold text-text">{m.name}</span>
            <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 text-xs text-text-muted">
              {m.narrativeRole}
            </span>
          </div>

          {/* 基础人设字段 */}
          <div className="space-y-2">
            <Field label="表层身份" value={m.surfaceIdentity} />
            <Field label="深层处境" value={m.deepSituation} />
            <Field label="核心欲望" value={m.coreDesire} />
            <Field label="核心恐惧" value={m.coreFear} />
            <Field label="最大弱点" value={m.biggestWeakness} />
            <Field label="底线触发" value={m.bottomLineTrigger} />
            <Field label="行为模式" value={m.actionPattern} />
            <Field label="关系失衡" value={m.relationshipImbalance} />
            <Field label="情绪功能" value={m.emotionFunction} />
            <Field label="爽点功能" value={m.satisfactionFunction} />
            <Field label="人物弧光" value={m.characterArc} />
            <Field label="可迁移身份" value={m.transferableIdentity} />
            <Field label="可迁移关系" value={m.transferableRelationship} />
            <Field label="不可复刻细节" value={m.nonReplicableDetails} />
          </div>

          {/* 主人公加拆 */}
          {m.protagonistExtra && (
            <div className="mt-4 rounded border-l-2 border-accent bg-accent/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-accent">主人公加拆</div>
              <div className="space-y-2">
                <Field label="初始低位" value={m.protagonistExtra.initialLowPosition} />
                <Field label="为何不先反击" value={m.protagonistExtra.whyNotCounterFirst} />
                <Field label="真实痛点" value={m.protagonistExtra.realPainPoint} />
                <Field label="忍耐边界" value={m.protagonistExtra.enduranceBoundary} />
                <Field label="反击能力来源" value={m.protagonistExtra.counterAbilitySource} />
                <Field label="首次觉醒事件" value={m.protagonistExtra.firstAwakeningEvent} />
                <Field label="真正越界事件" value={m.protagonistExtra.trueBoundaryCrossEvent} />
                <Field label="最佳行动" value={m.protagonistExtra.bestAction} />
                <Field label="高光动作" value={m.protagonistExtra.highlightAction} />
                <Field label="读者跟随理由" value={m.protagonistExtra.readerFollowReason} />
              </div>
            </div>
          )}

          {/* 反派加拆 */}
          {m.antagonistExtra && (
            <div className="mt-4 rounded border-l-2 border-danger bg-danger/5 p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-danger">反派加拆</div>
              <div className="space-y-2">
                <Field label="伤害方式" value={m.antagonistExtra.harmMethod} />
                <Field label="伤害逻辑" value={m.antagonistExtra.harmLogic} />
                <Field label="为何敢" value={m.antagonistExtra.whyDare} />
                <Field label="误判" value={m.antagonistExtra.misjudgment} />
                <Field label="读者厌恶原因" value={m.antagonistExtra.readerDislikeReason} />
                <Field label="辨识度" value={m.antagonistExtra.distinctiveness} />
                <Field label="接地气" value={m.antagonistExtra.grounded} />
                <Field label="输在哪里" value={m.antagonistExtra.lostWhere} />
                <Field label="因果对应" value={m.antagonistExtra.karmaMatches} />
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ===== 3. 人物小传 =====

function Biographies({ data }: { data: CharacterAnalysis["biographies"] }) {
  return (
    <div className="space-y-4">
      {data.map((b, i) => (
        <Card key={i}>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="font-display text-base font-bold text-text">{b.name}</span>
            <span className="text-xs text-text-muted">{b.role}</span>
          </div>
          <p className="text-sm leading-relaxed text-text">{b.biography}</p>
        </Card>
      ))}
    </div>
  );
}

// ===== 4. 可复用人设卡 =====

function ReusableCards({ data }: { data: CharacterAnalysis["reusableCards"] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {data.map((card, i) => (
        <Card key={i} className="border-l-4 border-l-accent">
          <div className="mb-2 font-display text-base font-bold text-text">{card.cardName}</div>
          <p className="mb-3 text-sm italic leading-relaxed text-text-muted">{card.oneLineCharacter}</p>
          <div className="space-y-2">
            <Field label="常见开场" value={card.commonOpening} />
            <Field label="常见高光动作" value={card.commonHighlightAction} />
            <Field label="常见反派压迫" value={card.commonAntagonistPressure} />
            <Field label="避免提醒" value={card.avoidanceReminder} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3">
            <ListBlock items={card.suitableGenres} title="适合题材" />
            <ListBlock items={card.commonPainPoints} title="常见痛点" />
            <ListBlock items={card.commonSatisfactionPoints} title="常见爽点" />
            <ListBlock items={card.transferableIdentities} title="可迁移身份" />
            <ListBlock items={card.transferableRelationships} title="可迁移关系" />
            <ListBlock items={card.suitableAntagonists} title="适合的反派" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== 5. 人物关系资产 =====

function Relationships({ data }: { data: CharacterAnalysis["relationships"] }) {
  return (
    <div className="space-y-4">
      {data.map((r, i) => (
        <Card key={i}>
          <div className="mb-3 font-display text-base font-bold text-text">{r.relationshipName}</div>
          <div className="space-y-2">
            <Field label="原始关系" value={r.originalRelationship} />
            <Field label="抽象关系" value={r.abstractRelationship} />
            <Field label="关系失衡" value={r.relationshipImbalance} />
            <Field label="冲突发动机" value={r.conflictEngine} />
            <Field label="情绪卖点" value={r.emotionSellingPoint} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ListBlock items={r.transferableRelationships} title="可迁移关系" />
            <ListBlock items={r.nonReplicableParts} title="不可复刻部分" />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ===== 6. 入库总表 =====

function EntryTable({ data }: { data: CharacterAnalysis["entryTable"] }) {
  if (data.length === 0) return null;

  return (
    <Card>
      <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">入库总表</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-bg-soft text-text-muted">
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">人设模型名</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">对应人物</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">叙事角色</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">核心欲望</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">核心恐惧</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">最大弱点</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">行为模式</th>
              <th className="whitespace-nowrap px-2 py-2 text-left font-normal">人物弧光</th>
            </tr>
          </thead>
          <tbody>
            {data.map((e, i) => (
              <tr key={i} className="border-b border-border last:border-0">
                <td className="whitespace-nowrap px-2 py-2 font-semibold text-text">{e.characterModelName}</td>
                <td className="whitespace-nowrap px-2 py-2 text-text-muted">{e.correspondingCharacter}</td>
                <td className="whitespace-nowrap px-2 py-2 text-text-muted">{e.narrativeRole}</td>
                <td className="px-2 py-2 text-text-muted">{e.coreDesire}</td>
                <td className="px-2 py-2 text-text-muted">{e.coreFear}</td>
                <td className="px-2 py-2 text-text-muted">{e.biggestWeakness}</td>
                <td className="px-2 py-2 text-text-muted">{e.actionPattern}</td>
                <td className="px-2 py-2 text-text-muted">{e.characterArc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 可迁移信息 */}
      <div className="mt-4 space-y-3">
        {data.map((e, i) => (
          <div key={i} className="rounded border border-border bg-bg-soft p-3">
            <div className="mb-2 text-xs font-semibold text-text">{e.characterModelName}</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ListBlock items={e.transferableIdentities} title="可迁移身份" />
              <ListBlock items={e.transferableRelationships} title="可迁移关系" />
              <ListBlock items={e.suitableGenres} title="适合题材" />
              <ListBlock items={e.nonReplicableZones} title="不可复刻区" />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ===== 7. 质量自检 =====

function CharacterSelfCheck({ data }: { data: CharacterAnalysis["selfCheck"] }) {
  const items: { label: string; value: string }[] = [
    { label: "Q1 人物分级", value: data.q1 },
    { label: "Q2 三层拆解", value: data.q2 },
    { label: "Q3 机制解释剧情", value: data.q3 },
    { label: "Q4 主人公拆清", value: data.q4 },
    { label: "Q5 反派拆清", value: data.q5 },
    { label: "Q6 关系抽象", value: data.q6 },
    { label: "Q7 不可复刻标注", value: data.q7 },
    { label: "Q8 换后成立", value: data.q8 },
  ];

  return (
    <Card>
      <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">质量自检</div>
      <div className="space-y-2">
        {items.filter((it) => it.value).map((it, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="shrink-0 font-mono text-xs text-accent">{it.label}</span>
            <span className="flex-1 leading-relaxed text-text">{it.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ===== 主组件 =====

interface Props {
  data: CharacterAnalysis;
}

export function CharacterReport({ data }: Props) {
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader num="01" title="人物清单与分级" />
        <CharacterList data={data.characterList} />
      </section>

      <section>
        <SectionHeader num="02" title="人设机制表" />
        <MechanismTables data={data.mechanismTables} />
      </section>

      <section>
        <SectionHeader num="03" title="人物小传" />
        <Biographies data={data.biographies} />
      </section>

      <section>
        <SectionHeader num="04" title="可复用人设卡" />
        <ReusableCards data={data.reusableCards} />
      </section>

      <section>
        <SectionHeader num="05" title="人物关系资产" />
        <Relationships data={data.relationships} />
      </section>

      <section>
        <SectionHeader num="06" title="入库总表" />
        <EntryTable data={data.entryTable} />
      </section>

      <section>
        <SectionHeader num="07" title="质量自检" />
        <CharacterSelfCheck data={data.selfCheck} />
      </section>
    </div>
  );
}
