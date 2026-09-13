/**
 * 自动匹配 · 硬编码关键词映射表（设计决策 D8）
 *
 * MVP 阶段标准费用项仅 5 项，「已含费用」与「合并映射」不新增配置表，
 * 直接在此维护关键词；标准项增多后再迁移为配置表。
 *
 * 对应标准项（migrations/seed.sql）：
 *   基础安装(fixed) / 桥架综合施工(per_meter) / 电缆穿管(per_meter)
 *   / 断路器安装(per_unit) / 其他增项(actual)
 */

/** 「已含费用」规则：命中关键词 → 判定「合同已含」 */
export interface IncludedRule {
  /** 声明该已含项的标准费用项名称（其 included_in_base_fee = 1） */
  readonly standardName: string
  /** item_name 包含任一关键词即命中 */
  readonly keywords: readonly string[]
}

/** 「合并映射」规则：命中关键词 → 合并到对应标准项 */
export interface MergeRule {
  /** 合并目标标准费用项名称（对应 standard_fee_items.name） */
  readonly target: string
  /** item_name 包含任一关键词即命中 */
  readonly keywords: readonly string[]
}

/**
 * 已含费用关键词（命中 → contract_included）
 * 典型案例（BRD）：服务商单独列「搬运费 60 元」，合同已含在基础安装内。
 */
export const INCLUDED_RULES: readonly IncludedRule[] = [
  { standardName: '基础安装', keywords: ['搬运'] },
]

/**
 * 合并映射关键词（命中 → 合并到对应标准项，用于 merged_consistent）
 * 典型案例：「桥架材料费」+「桥架安装费」→「桥架综合施工」
 */
export const MERGE_RULES: readonly MergeRule[] = [
  { target: '桥架综合施工', keywords: ['桥架'] },
  { target: '电缆穿管', keywords: ['电缆', '穿管'] },
  { target: '断路器安装', keywords: ['断路器'] },
]

/** item_name 命中「已含费用」关键词则返回规则，否则 null */
export function matchIncludedRule(itemName: string): IncludedRule | null {
  return INCLUDED_RULES.find((r) => r.keywords.some((kw) => itemName.includes(kw))) ?? null
}

/** item_name 命中「合并映射」关键词则返回规则，否则 null */
export function matchMergeRule(itemName: string): MergeRule | null {
  return MERGE_RULES.find((r) => r.keywords.some((kw) => itemName.includes(kw))) ?? null
}
