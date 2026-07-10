/**
 * InkSight 拆文+人设分析模块统一导出
 */

export { AnalysisInputSchema, runAnalysisPipeline } from "./pipeline";
export type { AnalysisInput, AnalysisResult } from "./pipeline";

export {
  PlotAnalysisSchema,
  CharacterAnalysisSchema,
  validatePlotAnalysis,
  validateCharacterAnalysis,
} from "./schema";
export type { PlotAnalysis, CharacterAnalysis } from "./schema";

export { PLOT_ANALYSIS_PROMPT, CHARACTER_ANALYSIS_PROMPT } from "./prompts";
