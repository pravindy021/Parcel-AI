export const formatNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat().format(value)
    : '—'

export const formatPercent = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—'

export const formatDateTime = (value, options = {}) => {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(undefined, options).format(date)
    : '—'
}

export const asChartRows = (items, labelKeys) =>
  (Array.isArray(items) ? items : []).map((item) => {
    const label = labelKeys.find((key) => item?.[key] !== undefined && item?.[key] !== null)
    const valueKey = Object.keys(item || {}).find(
      (key) => key !== label && typeof item[key] === 'number',
    )
    return label && valueKey ? { name: String(item[label]), value: item[valueKey] } : null
  }).filter(Boolean)

const csvCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value)
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safeText.replaceAll('"', '""')}"`
}

export const downloadCsv = (filename, rows, columns) => {
  if (!Array.isArray(rows) || rows.length === 0 || !Array.isArray(columns) || columns.length === 0) {
    throw new Error('There is no tabular data available to export.')
  }
  const csv = [
    columns.map(csvCell).join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row?.[column])).join(',')),
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export const downloadJson = (filename, payload) => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
