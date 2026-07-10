import { z } from "zod";

/**
 * InkSight 拆文+人设分析 Schema
 *
 * 基于用户提供的两个提示词：
 * 1. 短篇精准拆文提示词 → PlotAnalysisSchema（7 部分）
 * 2. 短篇人设提取提示词 → CharacterAnalysisSchema（7 部分）
 *
 * 设计原则：
 * - 高容错：所有字段用 z.any().transform() 接受任意输入
 * - 字符串兜底：null/undefined/数字统一转为字符串
 * - 数组兜底：字符串按换行拆分为数组
 * - 布尔兜底：中文"是/否/够/有"自动映射
 */

// ===== 容错辅助 =====

const str = z
  .any()
  .transform((v) => (v == null ? "" : String(v).trim()));

const strArr = z.any().transform((v) => {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
});

const bool = z.any().transform((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim();
    if (["是", "true", "1", "够", "有", "足够", "成立", "强烈"].some((k) => s.includes(k)))
      return true;
    if (["否", "false", "0", "不够", "无", "不足", "不成立"].some((k) => s.includes(k)))
      return false;
  }
  return false;
});

const strObj = z.record(z.string(), str);

const kvArr = z.array(
  z.object({
    key: str,
    value: str,
  })
);

// ===== 拆文 Schema =====

export const PlotAnalysisSchema = z.object({
  // 第一部分：编辑视角速看
  editorView: z.object({
    basicInfo: z.object({
      title: str,
      platform: str,
      wordCount: str,
      type: str,
      tags: str,
      oneLineSummary: str.describe("一句话总结（最重要）"),
      readerAttraction: str,
      worthTeardownReason: str,
    }),
    guideAnalysis: z.object({
      exists: bool,
      boundaryJudgment: str,
      highlights: strArr,
      protagonistIdentity: str,
      antagonist: str,
      firstConflict: str,
      painPoint: str,
      satisfactionPoint: str,
      readerCuriosity: str,
      isCatchy: bool,
    }),
    sentenceAnalysis: z.array(
      z.object({
        sentence: str,
        function: str,
      })
    ),
    guideReview: z.object({
      firstSentenceCatchy: bool,
      quickProtagonist: bool,
      quickRelations: bool,
      quickConflict: bool,
      strongContrast: bool,
      clearPainPoint: bool,
      promisesSatisfaction: bool,
      holdsQuestion: bool,
      mostValuableSentence: str,
      deletableSentence: str,
      guideModel: str,
    }),
    entryPoint: z.object({
      firstChapterEvent: str,
      connectsGuide: bool,
      amplifiesConflict: bool,
      establishesRelations: bool,
      givesDirection: bool,
    }),
    payPoint: z.object({
      position: str,
      precedingConflict: str,
      cardType: str,
      naturallyGrown: bool,
      infoGapRemaining: bool,
      readerWaiting: bool,
    }),
    deepTeardownJudgment: z.object({
      entryExplosive: str,
      antagonistDistinctive: str,
      payPointNatural: str,
      platformMatch: str,
      conclusion: str,
      reason: str,
    }),
  }),

  // 第二部分：六核心要素精拆
  sixCoreElements: z.object({
    pace: z.object({
      speed: str,
      mainStuckPoints: strArr,
      fastParts: strArr,
      slowParts: strArr,
      chapterEndHooks: bool,
    }),
    framework: z.object({
      coreAttractionType: str,
      bigFramework: str,
      setup: str,
      development: str,
      turn: str,
      conclusion: str,
      unchangeablePart: str,
    }),
    protagonist: z.object({
      surfaceIdentity: str,
      deepSituation: str,
      painPoint: str,
      desire: str,
      bottomLine: str,
      counterAbility: str,
      firstEstablishEvent: str,
      highlightAction: str,
    }),
    antagonist: z.object({
      surfaceIdentity: str,
      harmMethod: str,
      misjudgment: str,
      readerDislikeReason: str,
      distinctive: bool,
      grounded: bool,
    }),
    supporting: z.array(
      z.object({
        name: str,
        function: str,
      })
    ),
    painPoint: z.object({
      realPain: str,
      source: str,
      boundToCharacter: bool,
      readerResonance: bool,
      layeredDeepening: bool,
    }),
    satisfactionPoint: z.object({
      type: str,
      precedingPain: str,
      fulfillmentAction: str,
      immediateOrDelayed: str,
      exceedsGuidePromise: bool,
      prematureLeak: bool,
    }),
    infoGap: z.object({
      whoKnows: str,
      whoDoesntKnow: str,
      readerKnowsWhen: str,
      payPointRevealsWhen: str,
    }),
  }),

  // 第三部分：剧情及情绪走向
  plotEmotionFlow: z.object({
    payPointPosition: str,
    cardType: str,
    coreExpectation: str,
    releaseDirection: str,
    guidePromiseCaught: bool,
    chaptersBeforePayPoint: z.array(
      z.object({
        chapter: str,
        overallProgress: str,
        conflictProgress: str,
        emotionPull: str,
        endingHook: str,
      })
    ),
    chapterEvents: z.array(
      z.object({
        chapter: str,
        events: z.array(
          z.object({
            event: str,
            content: str,
            emotionPlotRole: str,
          })
        ),
      })
    ),
    emotionProgressionChain: z.object({
      initialEmotion: str,
      firstPressure: str,
      secondPressure: str,
      thirdPressure: str,
      maxPressure: str,
      smallSatisfactions: strArr,
      falsePromises: strArr,
      prematureSatisfaction: strArr,
      payPointTrigger: str,
    }),
    infoGapProgressionChain: z.object({
      knownInfo: str,
      hiddenInfo: str,
      misjudgedInfo: str,
      reversalSigns: str,
      approachingReveal: str,
      exhaustedEarly: bool,
      specificEnough: bool,
    }),
    chaptersAfterPayPoint: z.array(
      z.object({
        chapter: str,
        mainEvents: str,
        releaseDirection: str,
        role: str,
      })
    ),
    totalReview: z.object({
      guidePromise: str,
      stepByStep: str,
      naturalCardPoint: bool,
      strongPayImpulse: bool,
      enoughReleaseSpace: bool,
      disconnectExists: bool,
      cardPointAppearsFromNowhere: bool,
      mostReusablePart: str,
    }),
  }),

  // 第四部分：创作资产化拆解
  creativeAssets: z.object({
    coreGerm: z.object({
      originalCoreGerm: str,
      abstractCoreGerm: str,
      whatItSells: str,
      transferableParts: strArr,
      nonTransferableParts: strArr,
      worksAfterGenreChange: bool,
    }),
    conflictEngine: z.object({
      sustainedBy: str,
      coreOppression: str,
      antagonistLogic: str,
      protagonistCantSolveImmediately: str,
      escalationBy: str,
      transferableUse: str,
    }),
    emotionFuel: z.object({
      mainEmotion: str,
      emotionStart: str,
      pressureBy: str,
      releaseBy: str,
      bestMigrationTarget: str,
    }),
    satisfactionDelivery: z.object({
      deliveryBy: str,
      enoughPainBefore: bool,
      consistentWithGuide: bool,
      exceedsExpectation: bool,
      transferableMechanism: str,
    }),
    forbiddenZones: z.array(
      z.object({
        type: str,
        content: str,
      })
    ),
  }),

  // 第五部分：一主表六卡片
  masterTable: z.object({
    bookName: str,
    genre: str,
    tags: str,
    guideModel: str,
    coreAttraction: str,
    infoGap: str,
    payCardPoint: str,
    mainFormula: str,
    characterMechanism: str,
    painPointEvents: str,
    satisfactionEvents: str,
    forbiddenZones: str,
  }),
  materialCards: z.array(
    z.object({
      cardName: str,
      cardType: str,
      fields: kvArr,
    })
  ),

  // 第六部分：新故事生成方向
  newStoryDirections: z.array(
    z.object({
      newCoreGerm: str,
      suitableType: str,
      protagonistCharacter: str,
      antagonistHarmMethod: str,
      guideEntryPoint: str,
      payPointDirection: str,
      difference: str,
      risk: str,
    })
  ),
  recommendedDirection: str,
  recommendationReason: str,

  // 第七部分：质量自检
  selfCheck: z.object({
    coreAttraction: str,
    infoGapToPayPoint: str,
    chapterProgression: str,
    emotionProgression: str,
    skeletonTransferable: str,
  }),
});

// ===== 人设 Schema =====

export const CharacterAnalysisSchema = z.object({
  // 第一部分：人物清单与分级
  characterList: z.object({
    bookName: str,
    genre: str,
    coreCharacterAttraction: str,
    totalCharacters: str,
    characters: z.array(
      z.object({
        name: str,
        narrativeRole: str,
        actionRole: str,
        storyFunction: str,
        tier: str.describe("核心人物/关键配角/功能人物/可忽略人物"),
        needsFullAnalysis: bool,
      })
    ),
  }),

  // 第二部分：人设机制表
  mechanismTables: z.array(
    z.object({
      name: str,
      narrativeRole: str,
      surfaceIdentity: str,
      deepSituation: str,
      coreDesire: str,
      coreFear: str,
      biggestWeakness: str,
      bottomLineTrigger: str,
      actionPattern: str,
      relationshipImbalance: str,
      emotionFunction: str,
      satisfactionFunction: str,
      characterArc: str,
      transferableIdentity: str,
      transferableRelationship: str,
      nonReplicableDetails: str,
      // 主人公加拆
      protagonistExtra: z
        .object({
          initialLowPosition: str,
          whyNotCounterFirst: str,
          realPainPoint: str,
          enduranceBoundary: str,
          counterAbilitySource: str,
          firstAwakeningEvent: str,
          trueBoundaryCrossEvent: str,
          bestAction: str,
          highlightAction: str,
          readerFollowReason: str,
        })
        .optional(),
      // 反派加拆
      antagonistExtra: z
        .object({
          harmMethod: str,
          harmLogic: str,
          whyDare: str,
          misjudgment: str,
          readerDislikeReason: str,
          distinctiveness: str,
          grounded: str,
          lostWhere: str,
          karmaMatches: str,
        })
        .optional(),
    })
  ),

  // 第三部分：人物小传
  biographies: z.array(
    z.object({
      name: str,
      role: str,
      biography: str,
    })
  ),

  // 第四部分：可复用人设卡
  reusableCards: z.array(
    z.object({
      cardName: str,
      oneLineCharacter: str,
      suitableGenres: strArr,
      commonPainPoints: strArr,
      commonSatisfactionPoints: strArr,
      transferableIdentities: strArr,
      transferableRelationships: strArr,
      commonOpening: str,
      commonHighlightAction: str,
      commonAntagonistPressure: str,
      suitableAntagonists: strArr,
      avoidanceReminder: str,
    })
  ),

  // 第五部分：人物关系资产
  relationships: z.array(
    z.object({
      relationshipName: str,
      originalRelationship: str,
      abstractRelationship: str,
      relationshipImbalance: str,
      conflictEngine: str,
      emotionSellingPoint: str,
      transferableRelationships: strArr,
      nonReplicableParts: strArr,
    })
  ),

  // 第六部分：入库总表
  entryTable: z.array(
    z.object({
      characterModelName: str,
      correspondingCharacter: str,
      narrativeRole: str,
      coreDesire: str,
      coreFear: str,
      biggestWeakness: str,
      actionPattern: str,
      relationshipImbalance: str,
      emotionFunction: str,
      satisfactionFunction: str,
      characterArc: str,
      transferableIdentities: strArr,
      transferableRelationships: strArr,
      suitableGenres: strArr,
      nonReplicableZones: strArr,
    })
  ),

  // 第七部分：质量自检
  selfCheck: z.object({
    q1: str,
    q2: str,
    q3: str,
    q4: str,
    q5: str,
    q6: str,
    q7: str,
    q8: str,
  }),
});

// ===== 类型导出 =====

export type PlotAnalysis = z.infer<typeof PlotAnalysisSchema>;
export type CharacterAnalysis = z.infer<typeof CharacterAnalysisSchema>;

// ===== 校验器 =====

export function validatePlotAnalysis(data: unknown): {
  success: boolean;
  data?: PlotAnalysis;
  errors?: string[];
} {
  // 预处理：补齐缺失的顶层 key，避免 LLM 输出截断导致整体验证失败
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const defaults: Record<string, unknown> = {
      editorView: { basicInfo: {}, guideAnalysis: {}, sentenceAnalysis: [], guideReview: {}, entryPoint: {}, payPoint: {}, deepTeardownJudgment: {} },
      sixCoreElements: { pace: {}, framework: {}, protagonist: {}, antagonist: {}, supporting: [], painPoint: {}, satisfactionPoint: {}, infoGap: {} },
      plotEmotionFlow: { chaptersBeforePayPoint: [], chapterEvents: [], chaptersAfterPayPoint: [], totalReview: {} },
      creativeAssets: { coreGerm: {}, conflictEngine: {}, emotionFuel: {}, satisfactionDelivery: {}, forbiddenZones: [] },
      masterTable: {},
      materialCards: [],
      newStoryDirections: [],
      recommendedDirection: "",
    };
    for (const key of Object.keys(defaults)) {
      if (obj[key] == null) obj[key] = defaults[key];
    }
  }
  const result = PlotAnalysisSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

export function validateCharacterAnalysis(data: unknown): {
  success: boolean;
  data?: CharacterAnalysis;
  errors?: string[];
} {
  // 预处理：补齐缺失的顶层 key，避免 LLM 输出截断导致整体验证失败
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    const defaults: Record<string, unknown> = {
      characterList: { bookName: "", genre: "", coreCharacterAttraction: "", totalCharacters: "", characters: [] },
      mechanismTables: [],
      biographies: [],
      reusableCards: [],
      relationships: [],
      entryTable: [],
      selfCheck: { q1: "", q2: "", q3: "", q4: "", q5: "", q6: "", q7: "", q8: "" },
    };
    for (const key of Object.keys(defaults)) {
      if (obj[key] == null) obj[key] = defaults[key];
    }
  }
  const result = CharacterAnalysisSchema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  return {
    success: false,
    errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}
