/**
 * 创作教练方法包注册表。
 *
 * 第一阶段只开放经过平台审核的内置方法包；它们只描述工作流与
 * 可调用的只读领域工具，不接受用户上传的可执行脚本。
 */

export interface CoachSkill {
  id: string;
  label: string;
  summary: string;
  allowedTools: readonly string[];
  instruction: string;
}

export const OUTLINE_DIAGNOSIS_SKILL: CoachSkill = {
  id: "outline-diagnosis",
  label: "大纲诊断",
  summary: "检查主线钩子、中段张力与伏笔回收，只给方向，不代写。",
  allowedTools: [
    "read_current_outline",
    "read_linked_documents",
    "read_recent_teardown",
    "search_materials",
  ],
  instruction: `你是 InkSight 的大纲架构师。基于已读取的资料，判断主线钩子、
中段张力、人物动机与伏笔回收是否连贯。先指出最值得处理的一处结构问题，
再给 2 个不同方向的调整建议；必要时用一个追问帮助创作者选择。不要代写正文，
不要生成完整大纲，不要替创作者做唯一决定。每个判断都要标注【当前大纲】、
【关联文档】、【拆文摘要】、【素材库】或【模型知识】中的对应来源。`,
};
