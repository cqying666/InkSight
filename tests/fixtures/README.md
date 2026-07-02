# 测试集说明

## 用途
用于 Phase 0 拆解管线的端到端验证。5 篇测试文章覆盖情节驱动型、情感驱动型、氛围驱动型三种主要类型。

## 测试文章清单

| # | 文件 | 类型 | 字数 | 预期钩子 | 预期结局 |
|:--|:-----|:-----|:-----|:---------|:---------|
| 1 | test-1-suspense.txt | plot-driven | ~600 | suspense | twist |
| 2 | test-2-romance.txt | emotion-driven | ~600 | character | happy |
| 3 | test-3-atmosphere.txt | atmosphere-driven | ~600 | atmosphere | open |
| 4 | test-4-action.txt | plot-driven | ~600 | action | tragic |
| 5 | test-5-mixed.txt | mixed | ~600 | dialogue | ambiguous |

## 验收标准
- 5 篇测试文章经拆解管线后，JSON 输出格式 100% 通过 schema 校验
- 类型识别准确率 >= 60%（3/5 正确，因 mixed 容错）
- 每个维度的 evidence 字段非空
