/** 生成 32 位十六进制随机 token（用于 /submit/{token} 提交链接） */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 生成账单编号 SET-XXXX。
 * 以工单 id 填充：因 settlement_bills.work_order_id 唯一（1:1），可保证编号唯一。
 */
export function generateBillNo(workOrderId: number): string {
  return `SET-${String(workOrderId).padStart(4, '0')}`
}
