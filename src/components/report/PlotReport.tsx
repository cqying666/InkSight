"use client";

import type { PlotAnalysis } from "@/lib/analysis/schema";

/**
 * 拆文分析报告 — 7 部分渲染
 *
 * 1. 编辑视角速看
 * 2. 六核心要素
 * 3. 剧情及情绪走向
 * 4. 创作资产化
 * 5. 一主表六卡片
 * 6. 新故事方向
 * 7. 质量自检
 */

// ===== 通用小组件 =====

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

function Tag({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "yes" | "no" }) {
  const cls =
    tone === "yes"
      ? "border-success bg-success/10 text-success"
      : tone === "no"
      ? "border-danger bg-danger/10 text-danger"
      : "border-border bg-bg-soft text-text-muted";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${cls}`}>
      {children}
    </span>
  );
}

function BoolTag({ value, yesText = "是", noText = "否" }: { value: boolean; yesText?: string; noText?: string }) {
  return <Tag tone={value ? "yes" : "no"}>{value ? yesText : noText}</Tag>;
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

// ===== 1. 编辑视角速看 =====

function EditorView({ data }: { data: PlotAnalysis["editorView"] }) {
  const { basicInfo, guideAnalysis, sentenceAnalysis, guideReview, entryPoint, payPoint, deepTeardownJudgment } = data;

  return (
    <div className="space-y-5">
      {/* 基本信息 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">基本信息</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="标题" value={basicInfo.title} />
          <Field label="平台" value={basicInfo.platform} />
          <Field label="字数" value={basicInfo.wordCount} />
          <Field label="类型" value={basicInfo.type} />
          <Field label="标签" value={basicInfo.tags} />
        </div>
        <div className="mt-3">
          <Field label="一句话总结" value={basicInfo.oneLineSummary} />
        </div>
        <div className="mt-2 space-y-2">
          <Field label="读者吸引力" value={basicInfo.readerAttraction} />
          <Field label="值得拆解的理由" value={basicInfo.worthTeardownReason} />
        </div>
      </Card>

      {/* 导语分析 */}
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.15em] text-text-muted">导语分析</span>
          <BoolTag value={guideAnalysis.exists} yesText="有导语" noText="无导语" />
        </div>
        <div className="space-y-2">
          <Field label="边界判断" value={guideAnalysis.boundaryJudgment} />
          <Field label="主人公身份" value={guideAnalysis.protagonistIdentity} />
          <Field label="反派" value={guideAnalysis.antagonist} />
          <Field label="首个冲突" value={guideAnalysis.firstConflict} />
          <Field label="痛点" value={guideAnalysis.painPoint} />
          <Field label="爽点" value={guideAnalysis.satisfactionPoint} />
          <Field label="读者好奇点" value={guideAnalysis.readerCuriosity} />
        </div>
        {guideAnalysis.highlights.length > 0 && (
          <div className="mt-3">
            <ListBlock items={guideAnalysis.highlights} title="亮点" />
          </div>
        )}
      </Card>

      {/* 逐句分析 */}
      {sentenceAnalysis.length > 0 && (
        <Card>
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">导语逐句拆解</div>
          <div className="space-y-3">
            {sentenceAnalysis.map((s, i) => (
              <div key={i} className="border-l-2 border-accent pl-3">
                <p className="font-serif text-sm italic leading-relaxed text-text">「{s.sentence}」</p>
                <p className="mt-1 text-xs leading-relaxed text-text-muted">{s.function}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 导语复核 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">导语复核</div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <BoolTag value={guideReview.firstSentenceCatchy} yesText="首句抓人" noText="首句待加强" />
          <BoolTag value={guideReview.quickProtagonist} yesText="快速立人设" noText="人设偏慢" />
          <BoolTag value={guideReview.quickRelations} yesText="快速立关系" noText="关系偏慢" />
          <BoolTag value={guideReview.quickConflict} yesText="快速立冲突" noText="冲突偏慢" />
          <BoolTag value={guideReview.strongContrast} yesText="反差强烈" noText="反差不足" />
          <BoolTag value={guideReview.clearPainPoint} yesText="痛点清晰" noText="痛点模糊" />
          <BoolTag value={guideReview.promisesSatisfaction} yesText="承诺爽点" noText="未承诺爽点" />
          <BoolTag value={guideReview.holdsQuestion} yesText="留住悬念" noText="悬念不足" />
        </div>
        <div className="space-y-2">
          <Field label="最有价值的句子" value={guideReview.mostValuableSentence} />
          <Field label="可删除的句子" value={guideReview.deletableSentence} />
          <Field label="导语模式" value={guideReview.guideModel} />
        </div>
      </Card>

      {/* 入口点 + 付费点 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">入口点</div>
          <Field label="第一章事件" value={entryPoint.firstChapterEvent} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <BoolTag value={entryPoint.connectsGuide} yesText="衔接导语" noText="未衔接导语" />
            <BoolTag value={entryPoint.amplifiesConflict} yesText="放大冲突" noText="未放大冲突" />
            <BoolTag value={entryPoint.establishesRelations} yesText="确立关系" noText="未确立关系" />
            <BoolTag value={entryPoint.givesDirection} yesText="给出方向" noText="方向不明" />
          </div>
        </Card>
        <Card>
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">付费点</div>
          <div className="space-y-2">
            <Field label="位置" value={payPoint.position} />
            <Field label="前置冲突" value={payPoint.precedingConflict} />
            <Field label="卡点类型" value={payPoint.cardType} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <BoolTag value={payPoint.naturallyGrown} yesText="自然生成" noText="生硬" />
            <BoolTag value={payPoint.infoGapRemaining} yesText="留有信息差" noText="信息差不足" />
            <BoolTag value={payPoint.readerWaiting} yesText="读者在等" noText="读者等待感弱" />
          </div>
        </Card>
      </div>

      {/* 深拆判断 */}
      <Card className="border-l-4 border-l-accent">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.15em] text-text-muted">深拆判断</span>
          <Tag tone="yes">{deepTeardownJudgment.conclusion}</Tag>
        </div>
        <div className="space-y-2">
          <Field label="切入点是否够炸" value={deepTeardownJudgment.entryExplosive} />
          <Field label="反派是否有辨识度" value={deepTeardownJudgment.antagonistDistinctive} />
          <Field label="付费点是否自然" value={deepTeardownJudgment.payPointNatural} />
          <Field label="平台匹配度" value={deepTeardownJudgment.platformMatch} />
          <Field label="理由" value={deepTeardownJudgment.reason} />
        </div>
      </Card>
    </div>
  );
}

// ===== 2. 六核心要素 =====

function SixCoreElements({ data }: { data: PlotAnalysis["sixCoreElements"] }) {
  const { pace, framework, protagonist, antagonist, supporting, painPoint, satisfactionPoint, infoGap } = data;

  return (
    <div className="space-y-5">
      {/* 节奏 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">节奏</div>
        <Field label="速度" value={pace.speed} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ListBlock items={pace.mainStuckPoints} title="主要卡点" />
          <ListBlock items={pace.fastParts} title="快节奏部分" />
          <ListBlock items={pace.slowParts} title="慢节奏部分" />
        </div>
        <div className="mt-2">
          <BoolTag value={pace.chapterEndHooks} yesText="章末有钩子" noText="章末钩子不足" />
        </div>
      </Card>

      {/* 框架 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">框架</div>
        <Field label="核心吸引力类型" value={framework.coreAttractionType} />
        <Field label="大框架" value={framework.bigFramework} />
        <div className="mt-3 space-y-1">
          <Field label="建置" value={framework.setup} />
          <Field label="发展" value={framework.development} />
          <Field label="转折" value={framework.turn} />
          <Field label="结局" value={framework.conclusion} />
        </div>
        <div className="mt-3 rounded border border-border bg-bg-soft p-3">
          <Field label="不可替换部分" value={framework.unchangeablePart} />
        </div>
      </Card>

      {/* 主人公 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">主人公</div>
        <div className="space-y-2">
          <Field label="表层身份" value={protagonist.surfaceIdentity} />
          <Field label="深层处境" value={protagonist.deepSituation} />
          <Field label="痛点" value={protagonist.painPoint} />
          <Field label="欲望" value={protagonist.desire} />
          <Field label="底线" value={protagonist.bottomLine} />
          <Field label="反击能力" value={protagonist.counterAbility} />
          <Field label="人设确立事件" value={protagonist.firstEstablishEvent} />
          <Field label="高光动作" value={protagonist.highlightAction} />
        </div>
      </Card>

      {/* 反派 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">反派</div>
        <div className="space-y-2">
          <Field label="表层身份" value={antagonist.surfaceIdentity} />
          <Field label="伤害方式" value={antagonist.harmMethod} />
          <Field label="误判" value={antagonist.misjudgment} />
          <Field label="读者厌恶原因" value={antagonist.readerDislikeReason} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <BoolTag value={antagonist.distinctive} yesText="有辨识度" noText="辨识度不足" />
          <BoolTag value={antagonist.grounded} yesText="接地气" noText="悬浮" />
        </div>
      </Card>

      {/* 配角 */}
      {supporting.length > 0 && (
        <Card>
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">配角</div>
          <div className="space-y-2">
            {supporting.map((s, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="font-semibold text-text">{s.name}：</span>
                <span className="flex-1 text-text-muted">{s.function}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 痛点 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">痛点</div>
        <div className="space-y-2">
          <Field label="真实痛点" value={painPoint.realPain} />
          <Field label="来源" value={painPoint.source} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <BoolTag value={painPoint.boundToCharacter} yesText="绑定人物" noText="未绑定人物" />
          <BoolTag value={painPoint.readerResonance} yesText="读者共鸣" noText="共鸣不足" />
          <BoolTag value={painPoint.layeredDeepening} yesText="层层加深" noText="单层" />
        </div>
      </Card>

      {/* 爽点 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">爽点</div>
        <div className="space-y-2">
          <Field label="类型" value={satisfactionPoint.type} />
          <Field label="前置痛点" value={satisfactionPoint.precedingPain} />
          <Field label="兑现动作" value={satisfactionPoint.fulfillmentAction} />
          <Field label="即时/延迟" value={satisfactionPoint.immediateOrDelayed} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <BoolTag value={satisfactionPoint.exceedsGuidePromise} yesText="超出导语承诺" noText="未超出承诺" />
          <BoolTag value={satisfactionPoint.prematureLeak} yesText="提前泄漏" noText="未提前泄漏" />
        </div>
      </Card>

      {/* 信息差 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">信息差</div>
        <div className="space-y-2">
          <Field label="谁知道" value={infoGap.whoKnows} />
          <Field label="谁不知道" value={infoGap.whoDoesntKnow} />
          <Field label="读者何时知道" value={infoGap.readerKnowsWhen} />
          <Field label="付费点何时揭开" value={infoGap.payPointRevealsWhen} />
        </div>
      </Card>
    </div>
  );
}

// ===== 3. 剧情及情绪走向 =====

function PlotEmotionFlow({ data }: { data: PlotAnalysis["plotEmotionFlow"] }) {
  const {
    payPointPosition, cardType, coreExpectation, releaseDirection,
    chaptersBeforePayPoint, chapterEvents, emotionProgressionChain,
    infoGapProgressionChain, chaptersAfterPayPoint, totalReview,
  } = data;

  return (
    <div className="space-y-5">
      {/* 付费点概览 */}
      <Card className="border-l-4 border-l-accent">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label="付费点位置" value={payPointPosition} />
          <Field label="卡点类型" value={cardType} />
          <Field label="核心期待" value={coreExpectation} />
          <Field label="释放方向" value={releaseDirection} />
        </div>
      </Card>

      {/* 付费点前章节进展 */}
      {chaptersBeforePayPoint.length > 0 && (
        <Card>
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">付费点前 · 章节进展</div>
          <div className="space-y-3">
            {chaptersBeforePayPoint.map((ch, i) => (
              <div key={i} className="border-l-2 border-border pl-3">
                <div className="font-display text-sm font-semibold text-text">{ch.chapter}</div>
                <div className="mt-1 space-y-1">
                  <Field label="整体进展" value={ch.overallProgress} />
                  <Field label="冲突进展" value={ch.conflictProgress} />
                  <Field label="情绪拉扯" value={ch.emotionPull} />
                  <Field label="结尾钩子" value={ch.endingHook} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 逐章事件拆解 */}
      {chapterEvents.length > 0 && (
        <Card>
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">逐章事件拆解</div>
          <div className="space-y-4">
            {chapterEvents.map((ch, i) => (
              <div key={i}>
                <div className="mb-2 font-display text-sm font-semibold text-accent">{ch.chapter}</div>
                <div className="space-y-2">
                  {ch.events.map((ev, j) => (
                    <div key={j} className="flex gap-2 text-sm">
                      <span className="shrink-0 rounded border border-border bg-bg-soft px-1.5 py-0.5 font-mono text-xs text-text-muted">
                        {ev.event}
                      </span>
                      <div className="flex-1">
                        <p className="leading-relaxed text-text">{ev.content}</p>
                        <p className="mt-0.5 text-xs text-text-muted">{ev.emotionPlotRole}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 情绪推进链 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">情绪推进链</div>
        <div className="space-y-1">
          <Field label="初始情绪" value={emotionProgressionChain.initialEmotion} />
          <Field label="第一次加压" value={emotionProgressionChain.firstPressure} />
          <Field label="第二次加压" value={emotionProgressionChain.secondPressure} />
          <Field label="第三次加压" value={emotionProgressionChain.thirdPressure} />
          <Field label="情绪峰值" value={emotionProgressionChain.maxPressure} />
          <Field label="付费点触发" value={emotionProgressionChain.payPointTrigger} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ListBlock items={emotionProgressionChain.smallSatisfactions} title="小爽点" />
          <ListBlock items={emotionProgressionChain.falsePromises} title="假承诺" />
          <ListBlock items={emotionProgressionChain.prematureSatisfaction} title="提前爽点" />
        </div>
      </Card>

      {/* 信息差推进链 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">信息差推进链</div>
        <div className="space-y-1">
          <Field label="已知信息" value={infoGapProgressionChain.knownInfo} />
          <Field label="隐藏信息" value={infoGapProgressionChain.hiddenInfo} />
          <Field label="误判信息" value={infoGapProgressionChain.misjudgedInfo} />
          <Field label="反转苗头" value={infoGapProgressionChain.reversalSigns} />
          <Field label="接近揭开" value={infoGapProgressionChain.approachingReveal} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <BoolTag value={infoGapProgressionChain.exhaustedEarly} yesText="提前耗尽" noText="未提前耗尽" />
          <BoolTag value={infoGapProgressionChain.specificEnough} yesText="足够具体" noText="不够具体" />
        </div>
      </Card>

      {/* 付费点后章节 */}
      {chaptersAfterPayPoint.length > 0 && (
        <Card>
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">付费点后 · 释放空间</div>
          <div className="space-y-3">
            {chaptersAfterPayPoint.map((ch, i) => (
              <div key={i} className="border-l-2 border-border pl-3">
                <div className="font-display text-sm font-semibold text-text">{ch.chapter}</div>
                <div className="mt-1 space-y-1">
                  <Field label="主要事件" value={ch.mainEvents} />
                  <Field label="释放方向" value={ch.releaseDirection} />
                  <Field label="作用" value={ch.role} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 总评 */}
      <Card className="border-l-4 border-l-accent">
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">总评</div>
        <div className="space-y-2">
          <Field label="导语承诺" value={totalReview.guidePromise} />
          <Field label="层层递进" value={totalReview.stepByStep} />
          <Field label="最可复用部分" value={totalReview.mostReusablePart} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <BoolTag value={totalReview.naturalCardPoint} yesText="卡点自然" noText="卡点生硬" />
          <BoolTag value={totalReview.strongPayImpulse} yesText="付费冲动强" noText="付费冲动弱" />
          <BoolTag value={totalReview.enoughReleaseSpace} yesText="释放空间足" noText="释放空间不足" />
          <BoolTag value={totalReview.disconnectExists} yesText="存在断裂" noText="无断裂" />
          <BoolTag value={totalReview.cardPointAppearsFromNowhere} yesText="卡点突兀" noText="卡点不突兀" />
        </div>
      </Card>
    </div>
  );
}

// ===== 4. 创作资产化 =====

function CreativeAssets({ data }: { data: PlotAnalysis["creativeAssets"] }) {
  const { coreGerm, conflictEngine, emotionFuel, satisfactionDelivery, forbiddenZones } = data;

  return (
    <div className="space-y-5">
      {/* 核心梗 */}
      <Card className="border-l-4 border-l-accent">
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">核心梗</div>
        <div className="space-y-2">
          <Field label="原核心梗" value={coreGerm.originalCoreGerm} />
          <Field label="抽象核心梗" value={coreGerm.abstractCoreGerm} />
          <Field label="卖点" value={coreGerm.whatItSells} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ListBlock items={coreGerm.transferableParts} title="可迁移部分" />
          <ListBlock items={coreGerm.nonTransferableParts} title="不可迁移部分" />
        </div>
        <div className="mt-2">
          <BoolTag value={coreGerm.worksAfterGenreChange} yesText="换题材后成立" noText="换题材后不成立" />
        </div>
      </Card>

      {/* 冲突发动机 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">冲突发动机</div>
        <div className="space-y-2">
          <Field label="持续动力" value={conflictEngine.sustainedBy} />
          <Field label="核心压迫" value={conflictEngine.coreOppression} />
          <Field label="反派逻辑" value={conflictEngine.antagonistLogic} />
          <Field label="主人公无法立即解决" value={conflictEngine.protagonistCantSolveImmediately} />
          <Field label="升级方式" value={conflictEngine.escalationBy} />
          <Field label="可迁移用法" value={conflictEngine.transferableUse} />
        </div>
      </Card>

      {/* 情绪燃料 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">情绪燃料</div>
        <div className="space-y-2">
          <Field label="主情绪" value={emotionFuel.mainEmotion} />
          <Field label="情绪起点" value={emotionFuel.emotionStart} />
          <Field label="加压方式" value={emotionFuel.pressureBy} />
          <Field label="释放方式" value={emotionFuel.releaseBy} />
          <Field label="最佳迁移目标" value={emotionFuel.bestMigrationTarget} />
        </div>
      </Card>

      {/* 爽点交付 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">爽点交付</div>
        <div className="space-y-2">
          <Field label="交付方式" value={satisfactionDelivery.deliveryBy} />
          <Field label="可迁移机制" value={satisfactionDelivery.transferableMechanism} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <BoolTag value={satisfactionDelivery.enoughPainBefore} yesText="前置痛点足" noText="前置痛点不足" />
          <BoolTag value={satisfactionDelivery.consistentWithGuide} yesText="与导语一致" noText="与导语不一致" />
          <BoolTag value={satisfactionDelivery.exceedsExpectation} yesText="超出预期" noText="未超出预期" />
        </div>
      </Card>

      {/* 禁区 */}
      {forbiddenZones.length > 0 && (
        <Card className="border-l-4 border-l-danger">
          <div className="mb-3 text-xs uppercase tracking-[0.15em] text-danger">不可照搬（禁区）</div>
          <div className="space-y-2">
            {forbiddenZones.map((z, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="shrink-0 rounded border border-border bg-bg-soft px-1.5 py-0.5 text-xs text-text-muted">
                  {z.type}
                </span>
                <span className="flex-1 text-text">{z.content}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ===== 5. 一主表六卡片 =====

function MasterTableCards({ data }: { data: { masterTable: PlotAnalysis["masterTable"]; materialCards: PlotAnalysis["materialCards"] } }) {
  const { masterTable, materialCards } = data;

  const tableRows: { label: string; value: string }[] = [
    { label: "书名", value: masterTable.bookName },
    { label: "题材", value: masterTable.genre },
    { label: "标签", value: masterTable.tags },
    { label: "导语模式", value: masterTable.guideModel },
    { label: "核心吸引力", value: masterTable.coreAttraction },
    { label: "信息差", value: masterTable.infoGap },
    { label: "付费卡点", value: masterTable.payCardPoint },
    { label: "主要公式", value: masterTable.mainFormula },
    { label: "人物机制", value: masterTable.characterMechanism },
    { label: "痛点事件", value: masterTable.painPointEvents },
    { label: "爽点事件", value: masterTable.satisfactionEvents },
    { label: "禁区", value: masterTable.forbiddenZones },
  ];

  return (
    <div className="space-y-5">
      {/* 主表 */}
      <Card>
        <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">主表</div>
        <div className="overflow-hidden rounded border border-border">
          <table className="w-full text-sm">
            <tbody>
              {tableRows.filter((r) => r.value).map((row, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="w-28 shrink-0 bg-bg-soft px-3 py-2 text-xs text-text-muted">{row.label}</td>
                  <td className="px-3 py-2 text-text">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 六卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {materialCards.map((card, i) => (
          <Card key={i}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-sm font-bold text-text">{card.cardName}</span>
              <span className="rounded border border-border bg-bg-soft px-1.5 py-0.5 font-mono text-xs text-accent">
                {card.cardType}
              </span>
            </div>
            <div className="space-y-1.5">
              {card.fields.map((f, j) => (
                <Field key={j} label={f.key} value={f.value} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ===== 6. 新故事方向 =====

function NewStoryDirections({ data }: { data: { newStoryDirections: PlotAnalysis["newStoryDirections"]; recommendedDirection: string; recommendationReason: string } }) {
  const { newStoryDirections, recommendedDirection, recommendationReason } = data;

  return (
    <div className="space-y-5">
      {newStoryDirections.map((dir, i) => (
        <Card key={i}>
          <div className="mb-3 flex items-start justify-between gap-2">
            <span className="font-mono text-xs font-bold text-accent">方向 {String(i + 1).padStart(2, "0")}</span>
            {recommendedDirection.includes(dir.newCoreGerm.slice(0, 10)) && (
              <Tag tone="yes">推荐</Tag>
            )}
          </div>
          <div className="space-y-2">
            <Field label="新核心梗" value={dir.newCoreGerm} />
            <Field label="适合类型" value={dir.suitableType} />
            <Field label="主人公人设" value={dir.protagonistCharacter} />
            <Field label="反派伤害方式" value={dir.antagonistHarmMethod} />
            <Field label="导语入口" value={dir.guideEntryPoint} />
            <Field label="付费点方向" value={dir.payPointDirection} />
            <Field label="差异" value={dir.difference} />
            <Field label="风险" value={dir.risk} />
          </div>
        </Card>
      ))}

      {/* 推荐方向 */}
      {recommendedDirection && (
        <Card className="border-l-4 border-l-accent">
          <div className="mb-2 text-xs uppercase tracking-[0.15em] text-text-muted">推荐方向</div>
          <p className="font-display text-sm font-semibold text-text">{recommendedDirection}</p>
          {recommendationReason && (
            <p className="mt-1 text-sm leading-relaxed text-text-muted">{recommendationReason}</p>
          )}
        </Card>
      )}
    </div>
  );
}

// ===== 7. 质量自检 =====

function PlotSelfCheck({ data }: { data: PlotAnalysis["selfCheck"] }) {
  const items: { label: string; value: string }[] = [
    { label: "核心吸引力", value: data.coreAttraction },
    { label: "信息差到付费点", value: data.infoGapToPayPoint },
    { label: "章节推进", value: data.chapterProgression },
    { label: "情绪推进", value: data.emotionProgression },
    { label: "骨架可迁移性", value: data.skeletonTransferable },
  ];

  return (
    <Card>
      <div className="mb-3 text-xs uppercase tracking-[0.15em] text-text-muted">质量自检</div>
      <div className="space-y-2">
        {items.filter((it) => it.value).map((it, i) => (
          <div key={i} className="flex gap-2 text-sm">
            <span className="shrink-0 text-text-muted">{it.label}：</span>
            <span className="flex-1 leading-relaxed text-text">{it.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ===== 主组件 =====

interface Props {
  data: PlotAnalysis;
}

export function PlotReport({ data }: Props) {
  return (
    <div className="space-y-8">
      <section>
        <SectionHeader num="01" title="编辑视角速看" />
        <EditorView data={data.editorView} />
      </section>

      <section>
        <SectionHeader num="02" title="六核心要素" />
        <SixCoreElements data={data.sixCoreElements} />
      </section>

      <section>
        <SectionHeader num="03" title="剧情及情绪走向" />
        <PlotEmotionFlow data={data.plotEmotionFlow} />
      </section>

      <section>
        <SectionHeader num="04" title="创作资产化" />
        <CreativeAssets data={data.creativeAssets} />
      </section>

      <section>
        <SectionHeader num="05" title="一主表六卡片" />
        <MasterTableCards data={{ masterTable: data.masterTable, materialCards: data.materialCards }} />
      </section>

      <section>
        <SectionHeader num="06" title="新故事方向" />
        <NewStoryDirections data={{ newStoryDirections: data.newStoryDirections, recommendedDirection: data.recommendedDirection, recommendationReason: data.recommendationReason }} />
      </section>

      <section>
        <SectionHeader num="07" title="质量自检" />
        <PlotSelfCheck data={data.selfCheck} />
      </section>
    </div>
  );
}
