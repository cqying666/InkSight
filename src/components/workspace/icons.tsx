/**
 * 工作台图标集 —— 内联 SVG，细线条，匹配文学杂志风格
 * 无外部依赖，currentColor 继承文本色
 */

type IconProps = {
  className?: string;
};

const base = "h-4 w-4";

export function TeardownIcon({ className = base }: IconProps) {
  // 拆文：文档 + 放大镜
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 21V7a2 2 0 0 1 2-2h7l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z" />
      <circle cx="11" cy="15" r="2" />
      <path d="m12.5 16.5 1.5 1.5" />
    </svg>
  );
}

export function ReportIcon({ className = base }: IconProps) {
  // 报告：折线图
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4v15a1 1 0 0 0 1 1h14" />
      <path d="m9 14 3-3 3 2 4-5" />
    </svg>
  );
}

export function CompareIcon({ className = base }: IconProps) {
  // 对比：双栏
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="5" width="7" height="14" rx="1" />
      <rect x="13" y="5" width="7" height="14" rx="1" />
      <path d="M6.5 9h2M6.5 12h2M15.5 9h2M15.5 12h2" />
    </svg>
  );
}

export function TrendIcon({ className = base }: IconProps) {
  // 趋势：上升雷达波
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 17l5-5 4 3 6-7" />
      <path d="M14 8h5v5" />
    </svg>
  );
}

export function MaterialIcon({ className = base }: IconProps) {
  // 素材：书签集
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 4h9a1 1 0 0 1 1 1v15l-5.5-3L5 20V5a1 1 0 0 1 1-1Z" />
      <path d="M18 8h2v12l-4-2.2" />
    </svg>
  );
}

export function WriteIcon({ className = base }: IconProps) {
  // 写作：羽毛笔
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 4c-3 0-7 1-10 4L5 13l3 3 5-5c3-3 4-7 4-10Z" />
      <path d="M8 16l-3 3" />
      <path d="M5 19h6" />
    </svg>
  );
}

export function DashboardIcon({ className = base }: IconProps) {
  // 仪表盘：闭环箭头
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3a9 9 0 0 1 9 9" />
      <path d="M21 12a9 9 0 0 1-9 9" />
      <path d="M12 21a9 9 0 0 1-9-9" />
      <path d="M3 12a9 9 0 0 1 9-9" />
      <path d="M12 12l4-2" />
    </svg>
  );
}

export function CollapseIcon({ className = base }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function ExpandIcon({ className = base }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function CloseIcon({ className = base }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function DrawerIcon({ className = base }: IconProps) {
  // 伴随面板：侧栏抽屉
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="1" />
      <path d="M15 5v14" />
      <path d="M17 9h2M17 12h2M17 15h2" />
    </svg>
  );
}

export function HomeIcon({ className = base }: IconProps) {
  // 首页：屋檐
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function WorksIcon({ className = base }: IconProps) {
  // 我的作品：叠放的书页
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3h10a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M9 3v18" />
      <path d="M8 7h6M8 10h6M8 13h6" />
      <path d="M19 6v14a1 1 0 0 1-1 1H7" />
    </svg>
  );
}

export function AIControlIcon({ className = base }: IconProps) {
  // AI 管理：芯片 + 闪光
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
      <path d="M12 9.5 13 11l1.5 1-1.5 1-1 1.5-1-1.5L9 12.5 10.5 11.5 12 9.5Z" />
    </svg>
  );
}
