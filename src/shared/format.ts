/** 金额格式化：金额字段一律以「分」存储，展示时 /100 转元。 */

/** 分 → 元字符串（保留两位小数，含千分位），如 66000 → "660.00" */
export function centsToYuan(cents: number | null | undefined): string {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** 带符号金额：正 +、负 -、0 无符号，如 400 → "+4.00"、-320 → "-3.20" */
export function formatSignedCents(cents: number): string {
  if (cents > 0) return `+${centsToYuan(cents)}`
  if (cents < 0) return `-${centsToYuan(Math.abs(cents))}`
  return centsToYuan(0)
}

/** 数量格式化：整数直接显示，小数保留 2 位；null → — */
export function formatQuantity(quantity: number | null | undefined): string {
  if (quantity == null) return '—'
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

/** ISO 时间戳 → "YYYY-MM-DD HH:mm"；空 → — */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
