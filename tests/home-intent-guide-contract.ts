import assert from "node:assert/strict";
import {
  decideHomeIntent,
  splitInstructionAndContent,
} from "../src/lib/home/intent-router";
import {
  GUIDE_ANALYSIS_DIRECTIONS_EXTENSION,
  GuideAnalysisInputSchema,
  GuideAnalysisResultSchema,
  GuideAnalysisWithDirectionsResultSchema,
} from "../src/lib/analysis/guide-pipeline";

const guide =
  "订婚宴当天，未婚夫当众宣布要把婚房送给他的青梅。我没有争辩，只把那份被他忽略的股权转让书收回包里。三分钟后，公司法务推门而入，叫我新任董事长。";
const fullText = Array.from(
  { length: 16 },
  (_, index) => `第${index + 1}段：主人公在新的冲突中作出选择，局势继续升级。`
).join("\n\n");

function testIntentRouting() {
  const split = splitInstructionAndContent(
    `请分析这段导语并给三个二创方向：\n\n${guide}`
  );
  assert.equal(split.separated, true);
  assert.equal(split.content, guide);

  const quoted = splitInstructionAndContent(
    `请分析导语「${guide}」并给出可仿写方向`
  );
  assert.equal(quoted.separated, true);
  assert.equal(quoted.content, guide);

  const full = decideHomeIntent({
    prompt: `请拆解这篇全文：\n\n${fullText}`,
  });
  assert.equal(full.intent, "full_teardown");
  assert.equal(full.content, fullText);

  const guideOnly = decideHomeIntent({
    prompt: `请只分析下面这段导语，不需要改写：\n\n${guide}`,
  });
  assert.equal(guideOnly.intent, "guide_analysis");
  assert.equal(guideOnly.content, guide);

  const guideWithDirections = decideHomeIntent({
    prompt: `请分析下面导语，并根据核心元素给出可仿写和二创方向：\n\n${guide}`,
  });
  assert.equal(
    guideWithDirections.intent,
    "guide_analysis_with_directions"
  );
  assert.equal(guideWithDirections.content, guide);

  const generation = decideHomeIntent({
    prompt: "请根据古言追妻题材写三个差异化导语",
  });
  assert.equal(generation.intent, "guide_generation");

  const uploadedFull = decideHomeIntent({
    prompt: "",
    files: [{ name: "全文.txt", text: fullText }],
  });
  assert.equal(uploadedFull.intent, "full_teardown");
  assert.equal(uploadedFull.content, fullText);

  const uploadedGuide = decideHomeIntent({
    prompt: "分析这段导语并给出二创方向",
    files: [{ name: "导语.txt", text: guide }],
  });
  assert.equal(uploadedGuide.intent, "guide_analysis_with_directions");
  assert.equal(uploadedGuide.content, guide);
}

const baseResult = {
  guideAnalysis: {
    exists: true,
    boundaryJudgment: "完整导语",
    highlights: ["身份反转", "信息差"],
    protagonistIdentity: "被轻视的未婚妻",
    antagonist: "偏袒青梅的未婚夫",
    firstConflict: "公开处置共同利益",
    painPoint: "亲密关系中的轻视与剥夺",
    satisfactionPoint: "主角隐藏身份反转局面",
    readerCuriosity: "主角将如何收回主动权",
    isCatchy: true,
  },
  sentenceAnalysis: [{ sentence: "订婚宴当天。", function: "快速建立场景" }],
  guideReview: {
    firstSentenceCatchy: true,
    quickProtagonist: true,
    quickRelations: true,
    quickConflict: true,
    strongContrast: true,
    clearPainPoint: true,
    promisesSatisfaction: true,
    holdsQuestion: true,
    mostValuableSentence: "三分钟后，公司法务推门而入。",
    deletableSentence: "无",
    guideModel: "公开受辱＋冷静留后手＋身份反转",
  },
};

const directions = ["职场控制权", "家族继承权", "专业资格反转"].map(
  (title, index) => ({
    title,
    newCorePremise: `新核心梗 ${index + 1}`,
    transferableMechanism: "公开剥夺＋主角克制＋权力反转",
    replaceableElements: ["订婚宴→行业发布会", "婚房→核心项目"],
    openingBlueprint: "先建立公开场合，再落下剥夺动作，最后揭示主角后手",
    differentiation: "更换人物关系、利益载体与反转能力来源",
    risk: "避免复用原文数字、身份和句式",
  })
);

function testGuideContracts() {
  const input = GuideAnalysisInputSchema.parse({ text: guide });
  assert.equal(input.mode, "analysis");
  assert.equal(GuideAnalysisResultSchema.safeParse(baseResult).success, true);

  const withDirections = {
    ...baseResult,
    coreElements: {
      hookMechanism: "公开剥夺后立即埋下反转",
      protagonistSetup: "表面弱势、实际掌握关键资源",
      conflictEngine: "对方持续误判主角底牌",
      painPromise: "尊严与利益被同时剥夺",
      satisfactionPromise: "主角收回资源并完成权力反转",
      informationGap: "读者逐步发现主角拥有后手",
      emotionalContrast: "受辱时克制，揭底牌时陡升",
      sentenceStructure: ["场景与关系", "公开伤害", "克制反应", "后手揭示"],
    },
    derivativeDirections: directions,
    recommendedDirection: "职场控制权",
    recommendationReason: "利益载体清晰，且与原婚恋关系差异最大",
  };

  assert.equal(
    GuideAnalysisWithDirectionsResultSchema.safeParse(withDirections).success,
    true
  );
  assert.equal(
    GuideAnalysisWithDirectionsResultSchema.safeParse({
      ...withDirections,
      derivativeDirections: directions.slice(0, 2),
    }).success,
    false
  );
  assert.match(GUIDE_ANALYSIS_DIRECTIONS_EXTENSION, /3—5/);
  assert.match(GUIDE_ANALYSIS_DIRECTIONS_EXTENSION, /不沿用原文专属姓名/);
}

testIntentRouting();
testGuideContracts();
console.log("Home intent routing and guide-direction contracts passed.");
