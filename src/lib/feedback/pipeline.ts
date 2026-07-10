import { z } from "zod";
import { teardownNovel, detectNovelType } from "../teardown";
import type { TeardownResult, NovelTypeValue } from "../teardown/schema";
import { diagnose, type DiagnosisResult } from "../diagnosis/engine";
import {
  findCounterIntuitive,
  type SelfAssessment,
  type CounterIntuitiveFinding,
} from "../diagnosis/counter-intuitive";
import {
  generatePrescription,
  type Prescription,
} from "../prescription/generator";

/**
 * 三步反馈管线 (P1-T5) + 降级机制 (P1-T7)
 *
 * 完整流程：拆解 → 诊断 → 处方
 * 降级策略：
 *   - 处方超时 → 先返回拆解+诊断，处方标记为 loading
 *   - LLM 异常 → 返回已完成的步骤，失败步骤标记 error
 *   - 类型置信度 <0.7 → mixed 类型 + 通用基准
 */

export interface FeedbackResult {
  /** 拆解结果（永远存在，基础数据） */
  teardown: TeardownResult;
  /** 类型识别 */
  type: {
    type: NovelTypeValue;
    confidence: number;
    reasoning: string;
  };
  /** 诊断结果（永远存在，本地计算，不依赖 LLM） */
  diagnosis: DiagnosisResult;
  /** 反直觉发现（永远存在，本地计算） */
  counterIntuitive: CounterIntuitiveFinding[];
  /** 处方（可能因超时/异常而缺失） */
  prescription: {
    status: "loaded" | "loading" | "error" | "skipped";
    data?: Prescription;
    error?: string;
    durationMs?: number;
  };
  /** 元信息 */
  meta: {
    teardownMs: number;
    prescriptionMs?: number;
    totalMs: number;
    tokens: number;
    degraded: boolean;
    degradeReason?: string;
  };
}

// ===== 输入 Schema =====

export const FeedbackInputSchema = z.object({
  text: z.string().min(100, "小说文本过短，至少 100 字").max(50_000, "上限 50000 字"),
  selfAssessment: z
    .object({
      hookRating: z.number().min(1).max(5).optional(),
      tensionPosition: z.number().min(0).max(1).optional(),
      pace: z.enum(["fast", "medium", "slow"]).optional(),
    })
    .optional(),
});

export type FeedbackInput = z.infer<typeof FeedbackInputSchema>;

// ===== 主管线函数 =====

/**
 * 执行完整三步反馈管线
 *
 * @param input 小说文本 + 可选自评
 * @param options.timeout 处方超时毫秒数（默认 30000）
 */
export async function runFeedbackPipeline(
  input: FeedbackInput,
  options: {
    prescriptionTimeout?: number;
    /** P6-T9 类型识别+拆解超时毫秒数（默认 30000，防极端长尾） */
    teardownTimeout?: number;
  } = {}
): Promise<FeedbackResult> {
  const startTime = Date.now();
  // 推理模型（如 deepseek-v4-flash）含 reasoning 阶段，拆解+处方均需更长超时
  const { prescriptionTimeout = 90_000, teardownTimeout = 120_000 } = options;

  /**
   * P6-T9 通用 race timeout 包装
   * 防止 LLM 调用极端长尾（maxRetries=0 后仍可能因网络/服务端问题挂起）
   * 定时器在 race 结束后清理，避免泄漏与未处理拒绝
   */
  async function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    label: string
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label}超时（${ms}ms）`)),
        ms
      );
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ===== Step 1: 类型识别 + 拆解（先识别类型，再带类型拆解） =====
  // P6-T9: 加 race timeout 防止极端长尾（LLM client maxRetries=0 后仍可能挂起）
  let typeResult, teardownResult;
  try {
    typeResult = await withTimeout(
      detectNovelType(input.text),
      teardownTimeout,
      "类型识别"
    );
    teardownResult = await withTimeout(
      teardownNovel(input.text, typeResult.type),
      teardownTimeout,
      "结构拆解"
    );
  } catch (err) {
    // 拆解失败是致命的，无法降级（诊断/处方都依赖拆解结果）
    throw err;
  }

  const teardown: TeardownResult = teardownResult.data;
  const type = typeResult;

  // ===== Step 2: 诊断（本地计算，毫秒级，永不失败） =====
  const diagnosis = diagnose(teardown, type.type);

  // ===== Step 2.5: 反直觉发现（本地计算） =====
  const counterIntuitive = findCounterIntuitive(
    teardown,
    input.selfAssessment
  );

  // ===== Step 3: 处方（LLM 调用，可能超时/失败） =====
  let prescription: FeedbackResult["prescription"] = {
    status: "loading",
  };

  let degraded = false;
  let degradeReason: string | undefined;
  let prescriptionMs: number | undefined;

  // 如果没有薄弱点，跳过处方
  if (diagnosis.weaknesses.length === 0) {
    prescription = { status: "skipped" };
  } else {
    try {
      const prescriptionResult = await withTimeout(
        generatePrescription(teardown, diagnosis),
        prescriptionTimeout,
        "处方生成"
      );

      prescription = {
        status: "loaded",
        data: prescriptionResult.data,
        durationMs: prescriptionResult.durationMs,
      };
      prescriptionMs = prescriptionResult.durationMs;
    } catch (err) {
      // 降级：处方失败，但拆解+诊断已可用
      degraded = true;
      degradeReason = err instanceof Error ? err.message : String(err);
      prescription = {
        status: "error",
        error: degradeReason,
      };
    }
  }

  const totalMs = Date.now() - startTime;

  return {
    teardown,
    type,
    diagnosis,
    counterIntuitive,
    prescription,
    meta: {
      teardownMs: teardownResult.durationMs,
      prescriptionMs,
      totalMs,
      tokens: teardownResult.tokens,
      degraded,
      degradeReason,
    },
  };
}
