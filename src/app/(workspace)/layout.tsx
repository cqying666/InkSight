import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

/**
 * 工作台路由组共享外壳
 *
 * 所有放入 (workspace) 路由组的页面都会获得：
 *  - 左侧五段闭环导航（学/察/集/创/磨，可折叠）
 *  - 右侧伴随面板抽屉（素材 / 趋势）
 *  - 移动端顶栏 + 覆盖式导航
 *
 * 路由组 (workspace) 不影响 URL，故 /upload /report 等路径保持不变，
 * 现有内部链接无需修改。
 *
 * 根路由 /（落地页）位于本组之外，保持对外门面形态。
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WorkspaceShell>{children}</WorkspaceShell>;
}
