# InkSight Design System

**版本**：v1.0 — 奶油炭灰（Cream Ash）  
**日期**：2026-07-07  
**适用范围**：InkSight 短篇小说创作教练 · 全站产品界面

---

## 1. 设计定位

InkSight 是面向短篇小说创作者的 AI 教练工作台。设计气质应体现：

- **克制**（Restraint）：少即是多，避免营销感与过度装饰。
- **专注**（Focus）：界面服务于长时间写作与阅读，不抢夺内容注意力。
- **温暖**（Warmth）：通过暖调纸张与柔和光晕，降低 AI 工具的距离感。
- **编辑感**（Editorial）：现代 SaaS 与文学杂志美学的结合，信息层级清晰如排版。

设计不是品牌，而是工具。用户打开 InkSight 时，应像坐在一张干净的橡木书桌前。

---

## 2. 色彩系统

### 2.1 主色板

| Token | 角色 | Hex | 使用场景 |
|---|---|---|---|
| `primary` | 主色 / 深炭灰 | `#1C1C1E` | 主按钮、关键文字、图标、教练标识 |
| `accent` | 强调色 / 暖灰褐 | `#7C6F66` | 次级按钮边框、标签、弱化高亮、 Coach 副标 |
| `bg` | 背景色 / 奶油白 | `#FAF7F2` | 页面主背景 |
| `bg-alt` | 次级背景 / 暖米灰 | `#F3EEE6` | 卡片背景、对话区、统计面板 |
| `bg-elevated` | 浮层背景 / 近白 | `#FFFFFF` | 弹窗、抽屉、输入框、悬浮卡片 |
| `text` | 正文文字 / 深炭 | `#1C1C1E` | 标题、正文 |
| `text-muted` | 弱化文字 / 暖灰 | `#6E6A63` | 副标题、说明、图例、占位符 |
| `text-inverse` | 反白文字 | `#FAF7F2` | 深色按钮上的文字 |
| `border` | 边框 / 半透明炭灰 | `rgba(28,28,30,0.08)` | 卡片边框、分割线、输入框边框 |
| `border-strong` | 强边框 / 半透明炭灰 | `rgba(28,28,30,0.16)` | hover/激活态边框 |

### 2.2 功能语义色

| Token | Hex | 使用场景 |
|---|---|---|
| `success` | `#5B7A5B` | 成功状态、正向指标 |
| `warning` | `#B8894A` | 警告、提示 |
| `danger` | `#A94B4B` | 错误、删除、强烈提醒 |
| `info` | `#6A7D89` | 信息提示 |

> 原则：功能色仅在状态反馈中使用，不用于主视觉装饰。主视觉只由 `primary` + `accent` + `bg` 三色构建。

### 2.3 渐变与光晕

**页面顶部环境光晕**（Hero/Banner 区域使用）：
```
background: radial-gradient(ellipse 80% 100% at 50% 0%, rgba(245,220,200,0.45), transparent 60%),
            radial-gradient(ellipse 60% 80% at 80% 0%, rgba(232,213,224,0.35), transparent 55%);
```

- 主光晕：暖橙 `#F5DCC8`（72% 透明度）
- 辅光晕：淡粉紫 `#E8D5E0`（56% 透明度）
- 两色光晕叠加，模拟清晨窗边的自然光感。

**局部 hover 渐变**：
```
background: linear-gradient(180deg, rgba(28,28,30,0.04) 0%, transparent 100%);
```

### 2.4 深色模式（预留）

如需深色模式，建议：
- `bg` → `#121214`
- `bg-alt` → `#1A1A1E`
- `text` → `#F0EDE6`
- `text-muted` → `#8A8680`
- `border` → `rgba(240,237,230,0.10)`

> 当前版本仅实现浅色模式，代码中避免硬编码颜色，以便未来切换。

---

## 3. 字体系统

### 3.1 字体族

| Token | 字体栈 | 角色 |
|---|---|---|
| `font-serif` | `"Cormorant Garamond", "Noto Serif SC", serif` | 标题、教练对话、文学化表达 |
| `font-sans` | `"Inter", "Noto Sans SC", sans-serif` | 按钮、标签、数据、导航 |
| `font-mono` | `"JetBrains Mono", "SF Mono", "Menlo", monospace` | 编号、日期、代码、小标签 |

### 3.2 字号规范

| Token | Size | Line Height | Letter Spacing | 用途 |
|---|---|---|---|---|
| `display` | `clamp(2.25rem, 5vw, 3.5rem)` | 1.05 | -0.02em | 页面主标题 |
| `title-xl` | `2.25rem` / `36px` | 1.1 | -0.02em | 区块大标题 |
| `title-lg` | `1.5rem` / `24px` | 1.2 | -0.01em | 卡片标题 |
| `title-md` | `1.125rem` / `18px` | 1.35 | 0 | 小标题 |
| `body` | `0.9375rem` / `15px` | 1.65 | 0 | 正文 |
| `body-sm` | `0.8125rem` / `13px` | 1.5 | 0 | 次要正文 |
| `caption` | `0.6875rem` / `11px` | 1.4 | 0.12em | 小标签、MONO 副标 |
| `tiny` | `0.625rem` / `10px` | 1.4 | 0.08em | 图例、脚注 |

### 3.3 排版规则

- **标题使用衬线体**，正文默认无衬线，关键文学化语句可用衬线强调。
- **大标题负字距**，营造紧凑、自信的节奏。
- **正文行高 1.6–1.7**，保证长文阅读舒适。
- **日期、编号、数据标签使用 mono**，与正文形成字体张力。
- 中文段落避免 `letter-spacing` 过宽。

---

## 4. 间距与布局

### 4.1 布局网格

- **工作台页面**：最大宽度 `1200px`，主内容区与侧栏采用非对称双栏 `1fr 320px`（lg 以上）。
- **落地页**：最大宽度 `1280px`，居中布局，区块间距大。
- **移动端**：单列，侧栏变顶栏汉堡菜单。

### 4.2 间距 token

| Token | Value | 用途 |
|---|---|---|
| `space-xs` | `4px` | 图标与文字间距 |
| `space-sm` | `8px` | 紧凑组件内间距 |
| `space-md` | `16px` | 卡片内边距、组件间距 |
| `space-lg` | `24px` | 区块内部间距 |
| `space-xl` | `40px` | 区块之间间距 |
| `space-2xl` | `64px` | 页面级大间距 |

### 4.3 圆角

| Token | Value | 用途 |
|---|---|---|
| `radius-sm` | `4px` | 卡片、输入框、按钮 |
| `radius-md` | `8px` | 大卡片、面板 |
| `radius-lg` | `12px` | 弹窗、抽屉 |
| `radius-full` | `9999px` | 标签、胶囊按钮 |

> 规则：产品界面以 `radius-sm` 为主，少量 `radius-full` 用于标签/快选。避免超大圆角。

---

## 5. 组件规范

### 5.1 按钮

**主按钮**
- 背景：`primary` (#1C1C1E)
- 文字：`text-inverse` (#FAF7F2)
- 圆角：`radius-full`
- 内边距：`px-5 py-2`
- 字体：`font-sans text-xs`
- Hover：`opacity 0.9`，或背景变为 `accent`

**次按钮**
- 背景：透明
- 边框：`1px solid border`
- 文字：`text`
- Hover：背景 `bg-alt`

**标签/快选按钮**
- 背景：`bg` 或 `bg-alt`
- 边框：`1px solid border`
- 文字：`text-muted`
- 圆角：`radius-full`
- Hover：边框变为 `border-strong`，文字变为 `primary`

### 5.2 输入框

- 背景：`bg-elevated` (#FFFFFF)
- 边框：`1px solid border`
- 圆角：`radius-sm`
- Placeholder：`text-muted`
- Focus：`border-strong`，`ring-1 ring-primary/10`
- 文本域与输入框一致。

### 5.3 卡片

- 背景：`bg-alt`
- 边框：`1px solid border`
- 圆角：`radius-sm`
- 阴影：仅在大面积漂浮卡片使用极淡阴影
  ```
  box-shadow: 0 1px 3px rgba(28,28,30,0.04), 0 8px 24px rgba(28,28,30,0.03);
  ```

### 5.4 教练对话区

- 背景：`bg-alt` + 纸质颗粒纹理（opacity 0.025）
- 教练标识：圆形 `primary/10` 背景 + `primary` 文字「教」
- Coach 标签：`font-mono caption` + `accent` 色
- 教练文字：`font-serif body` + `text`
- 用户输入：底部边线输入框，无边框感
- 发送按钮：`primary` 背景 + `text-inverse` + `mono caption`

### 5.5 数据可视化

- 图表只使用 `primary`、`accent`、`text-muted` 三色。
- 柱状图圆角 `2px`，max-width `20px`。
- 堆叠条高度 `16–20px`，圆角 `radius-full`。
- 数字使用 `tabular-nums`。
- 图表 tooltip：`bg-elevated` + 细边框 + 小字号。

### 5.6 导航

**桌面侧栏**
- 背景：`bg`
- 当前项：左侧 `2px primary` 竖线 + `bg-alt` 背景
- 文字：`font-sans text-sm`
- 图标与文字间距 `space-sm`

**移动端顶栏**
- 背景：`bg` + 底部 `1px border`
- 汉堡菜单按钮：`primary`

---

## 6. 质感与动效

### 6.1 颗粒纹理

全局固定一层 SVG `feTurbulence` 颗粒，opacity 0.025–0.04，模拟纸张/胶片质感。

```html
<svg class="fixed inset-0 opacity-[0.035] pointer-events-none z-0">
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" /></filter>
  <rect width="100%" height="100%" filter="url(#grain)" />
</svg>
```

### 6.2 顶部光晕

页面主要内容区顶部使用 radial-gradient 暖调光晕，opacity 柔和（见 2.3）。

### 6.3 动效

- **原则**：克制。产品界面不需要 spectacle 级动效。
- **允许**：hover 颜色过渡（`transition-colors duration-200`）、focus ring 出现、淡入（fade-in）。
- **禁止**：大幅位移动画、弹窗缩放、复杂 stagger reveal、marquee。
- **Reduced motion**：所有动画必须响应 `prefers-reduced-motion: reduce`，直接显示最终状态。

---

## 7. 图标与插图

- 使用 **Lucide React** 图标库。
- 图标尺寸默认 `16px`（sm）、`20px`（md）、`24px`（lg）。
- 图标颜色跟随当前文字颜色（`currentColor`）。
- 不使用 emoji 作为图标。
- 无插图时，以文字排版与数据本身作为视觉内容。

---

## 8. 可访问性

- 正文与背景对比度 ≥ 4.5:1。
- 大文字与背景对比度 ≥ 3:1。
- 所有交互元素有可见 `focus-visible` 状态。
- 表单输入关联 `<label>` 或使用 `aria-label`/`sr-only`。
- 动态内容（教练回复）不使用 `aria-live` 过度打扰，保持静默更新。
- 支持键盘操作，Tab 顺序符合视觉顺序。

---

## 9. 禁止清单（Anti-Cheap）

以下元素不得在产品界面出现：

- 渐变文字 / 彩虹渐变背景
- 毛玻璃 / backdrop-blur 大面积使用
- 六列等高图标卡片网格
- 虚假精确数字（如 `92%`, `4.1×`）无来源
- AI 紫色 glow / 霓虹描边
- 每节都有的 tiny uppercase eyebrow
- 纯黑 `#000000` / 纯白 `#FFFFFF` 大面积使用
- 阴影过重或 colored shadow
- 营销式大字报 CTA

---

## 10. 实施原则

- **代码中禁止硬编码颜色**。所有颜色必须通过 Tailwind token 或 CSS 变量引用。
- 新增页面时，先查阅本文件，确保使用一致 token。
- 如需偏离本系统，必须在 design.md 中更新并记录原因。

---

**本设计系统由奶油炭灰配色版本定义，后续所有视觉迭代以此为基础。**
