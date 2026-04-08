/**
 * 格式化金额：每4位打一个逗号（万位格式），保留2位小数
 * 示例：12345.67 → "1,2345.67"
 */
export function formatAmount(num) {
  const value = parseFloat(num)
  if (isNaN(value)) return '0.00'
  const negative = value < 0
  let [integer, decimal] = Math.abs(value).toFixed(2).split('.')
  integer = integer.replace(/\B(?=(\d{4})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${integer}.${decimal}`
}
