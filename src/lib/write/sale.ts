/**
 * 作品售出信息模型与统计纯函数
 *
 * 第一版只支持买断模式（单笔交易），不支持分成月结。
 */

/** 常用买家平台（用于 datalist 输入提示） */
export const COMMON_BUYERS = [
  "番茄短篇",
  "知乎盐选",
  "七猫",
  "点众",
  "黑岩",
  "书旗",
  "其他",
] as const;

/** 售出状态 */
export type SaleStatus = "unsold" | "sold";

/** 售出信息 */
export interface Sale {
  status: SaleStatus;
  /** 售出价格（元） */
  price: number;
  /** 买家（平台名） */
  buyer: string;
  /** 售出日期 timestamp */
  soldAt: number;
  /** 千字单价（元/千字），可与 price 互相推算 */
  unitPrice?: number;
  /** 计价字数（用户可修改，默认为系统检测字数） */
  wordCount?: number;
  /** 备注（编辑名 / 合同号 / 分成约定等） */
  note?: string;
}

/**
 * 判断作品是否已售出
 */
export function isSold(sale: Sale | undefined): boolean {
  return !!sale && sale.status === "sold";
}

/** 月度售出统计 */
export interface MonthlySaleStats {
  /** 当月售出金额（元） */
  monthlyRevenue: number;
  /** 当月售出篇数 */
  monthlyCount: number;
  /** 累计作品数 */
  totalCount: number;
  /** 已售出作品数 */
  soldCount: number;
  /** 未售出作品数 */
  unsoldCount: number;
  /** 当月售出明细（按 soldAt 倒序） */
  monthlyDetails: Array<{
    id: string;
    title: string;
    buyer: string;
    price: number;
    soldAt: number;
  }>;
}

/**
 * 计算作品售出统计
 *
 * @param works 全部作品列表
 * @param anchor 时间锚点（默认当前时间），用于界定「当月」
 */
export function computeMonthlyStats(
  works: ReadonlyArray<{
    id: string;
    title: string;
    sale?: Sale;
  }>,
  anchor: number = Date.now()
): MonthlySaleStats {
  const anchorDate = new Date(anchor);
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  const monthlyDetails: MonthlySaleStats["monthlyDetails"] = [];
  let monthlyRevenue = 0;
  let monthlyCount = 0;
  let soldCount = 0;

  for (const w of works) {
    if (!isSold(w.sale)) continue;
    soldCount++;
    const soldDate = new Date(w.sale!.soldAt);
    const isSameMonth =
      soldDate.getFullYear() === year && soldDate.getMonth() === month;
    if (isSameMonth) {
      monthlyCount++;
      monthlyRevenue += w.sale!.price;
      monthlyDetails.push({
        id: w.id,
        title: w.title || "无题",
        buyer: w.sale!.buyer,
        price: w.sale!.price,
        soldAt: w.sale!.soldAt,
      });
    }
  }

  monthlyDetails.sort((a, b) => b.soldAt - a.soldAt);

  return {
    monthlyRevenue,
    monthlyCount,
    totalCount: works.length,
    soldCount,
    unsoldCount: works.length - soldCount,
    monthlyDetails,
  };
}

/**
 * 格式化金额（元 → 带千分位的展示字符串）
 */
export function formatPrice(price: number): string {
  return `¥${price.toLocaleString("zh-CN")}`;
}
