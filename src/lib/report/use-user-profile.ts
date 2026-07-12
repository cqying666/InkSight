"use client";

import { useEffect, useState } from "react";
import { peekEvents } from "./analytics";
import {
  computeUserProfile,
  type UserProfile,
} from "./metrics";
import {
  readTeardownHistory,
  aggregateWeakAreas,
} from "./teardown-history";

/**
 * P6-T1 + P6-T2 客户端用户画像 Hook
 *
 * 从 localStorage 埋点队列读取事件，计算用户画像
 *  - 客户端专用（localStorage 仅在浏览器可用）
 *  - 首次渲染返回 null（避免 hydration 不匹配）
 *  - 事件变化时自动刷新（通过 focus 事件触发重算）
 *  - P6-T2: 合并 teardown-history 聚合的 weakAreas
 *
 * 用法：
 *   const profile = useUserProfile();
 *   if (profile?.stage === "newcomer") { ... }
 *   if (profile?.weakAreas.includes("反转数量")) { ... }
 */
export function useUserProfile(): UserProfile | null {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      const events = await peekEvents();
      if (cancelled) return;
      const base = computeUserProfile(events);
      // P6-T2 合并薄弱点历史（critical×3 + warning×1 加权 Top 3）
      const history = await readTeardownHistory();
      if (cancelled) return;
      const weakAreas = aggregateWeakAreas(history, 3);
      setProfile({ ...base, weakAreas });
    };
    void compute();
    // 窗口重新聚焦时刷新（用户可能在新标签页产生了事件）
    window.addEventListener("focus", compute);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", compute);
    };
  }, []);

  return profile;
}
