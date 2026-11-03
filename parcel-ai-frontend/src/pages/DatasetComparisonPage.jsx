import { AlertCircle, ArrowRightLeft, Download, Loader2, Scale } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/common/Card'
import StatusBadge from '../components/common/StatusBadge'
import DatasetComparisonChart from '../components/charts/DatasetComparisonChart'
import { useAppContext } from '../context/useAppContext'
import { analyzeDataset, getDatasetAnalysis, getDatasetPreview } from '../services/api'
import { asChartRows, downloadCsv, formatNumber, formatPercent } from '../utils/data'

const carrierKeys = ['carrier', 'carrier_name', 'shipping_carrier']
const normalizeColumns = (columns) => new Set((columns || []).map((column) => String(column).trim().toLowerCase()))
const semanticGroups = [
  ['shipment_id', 'shipmentid', 'tracking_number', 'tracking_id'],
  carrierKeys,
  ['origin_warehouse', 'warehouse', 'warehouse_id'],
  ['destination', 'destination_city', 'destination_warehouse'],
  ['status', 'delivery_status'],
  ['promised_delivery_date', 'promised_date', 'delivery_due_date'],
  ['actual_delivery_date', 'delivered_at', 'delivery_date'],
]

const hasSemanticOverlap = (firstColumns, secondColumns) => {
  const first = normalizeColumns(firstColumns)
  const second = normalizeColumns(secondColumns)
  return semanticGroups.some((group) => group.some((key) => first.has(key)) && group.some((key) => second.has(key)))
}

const loadDatasetResult = async (datasetId) => {
  const [previewResponse, analysisResponse] = await Promise.all([
    getDatasetPreview(datasetId, 50),
    getDatasetAnalysis(datasetId).catch(async (error) => {
      if (error.status !== 404) throw error
      return analyzeDataset(datasetId)
    }),
  ])
  return { preview: previewResponse.data, analysis: analysisResponse.data }
}

const metricData = (label, firstValue, secondValue, formatter = formatNumber) => {
  const comparable = typeof firstValue === 'number' && Number.isFinite(firstValue)
    && typeof secondValue === 'number' && Number.isFinite(secondValue)
  return {
    label,
    firstValue: comparable ? formatter(firstValue) : 'Unavailable',
    secondValue: comparable ? formatter(secondValue) : 'Unavailable',
    difference: comparable ? secondValue - firstValue : null,
  }
}

const MetricCard = ({ metric, firstName, secondName }) => (
  <Card>
    <h3 className="text-sm font-semibold text-slate-800">{metric.label}</h3>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <div className="min-w-0 rounded-xl bg-blue-50 p-3"><p className="truncate text-xs text-blue-800">{firstName}</p><p className="mt-1 text-lg font-bold text-slate-950">{metric.firstValue}</p></div>
      <div className="min-w-0 rounded-xl bg-cyan-50 p-3"><p className="truncate text-xs text-cyan-900">{secondName}</p><p className="mt-1 text-lg font-bold text-slate-950">{metric.secondValue}</p></div>
    </div>
    <p className="mt-3 text-xs text-slate-500">
      {metric.difference === null
        ? 'Difference unavailable: the backend did not return this metric for both datasets.'
        : `Difference (second − first): ${metric.label.includes('rate') || metric.label.includes('delivery') ? `${metric.difference > 0 ? '+' : ''}${metric.difference.toFixed(1)} percentage points` : `${metric.difference > 0 ? '+' : ''}${formatNumber(metric.difference)}`}`}
    </p>
  </Card>
)

export const DatasetComparisonPage = () => {
  const { datasets, markReportExported, selectedDatasetId, workspaceReady } = useAppContext()
  const [firstDatasetId, setFirstDatasetId] = useState('')
  const [secondDatasetId, setSecondDatasetId] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')

  const firstId = firstDatasetId || (datasets.some((item) => item.id === selectedDatasetId) ? selectedDatasetId : datasets[0]?.id || '')
  const secondId = datasets.some((item) => item.id === secondDatasetId && item.id !== firstId)
    ? secondDatasetId
    : datasets.find((item) => item.id !== firstId)?.id || ''
  const firstDataset = datasets.find((item) => item.id === firstId)
  const secondDataset = datasets.find((item) => item.id === secondId)
  const resultIsCurrent = result?.firstId === firstId && result?.secondId === secondId

  const compare = async (event) => {
    event.preventDefault()
    if (!firstId || !secondId || firstId === secondId) {
      setError('Choose two different uploaded datasets to compare.')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const [first, second] = await Promise.all([
        loadDatasetResult(firstId),
        loadDatasetResult(secondId),
      ])
      setResult({ firstId, secondId, first, second, generatedAt: new Date().toISOString() })
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  const comparison = useMemo(() => {
    if (!resultIsCurrent) return null
    const firstColumns = result.first.preview.columns || []
    const secondColumns = result.second.preview.columns || []
    const firstNormalized = normalizeColumns(firstColumns)
    const secondNormalized = normalizeColumns(secondColumns)
    const sharedColumns = firstColumns.filter((column) => secondNormalized.has(String(column).trim().toLowerCase()))
    const firstOnly = firstColumns.filter((column) => !secondNormalized.has(String(column).trim().toLowerCase()))
    const secondOnly = secondColumns.filter((column) => !firstNormalized.has(String(column).trim().toLowerCase()))
    const firstSummary = result.first.analysis.summary || {}
    const secondSummary = result.second.analysis.summary || {}
    const metrics = [
      metricData('Shipment volume', firstSummary.total_shipments, secondSummary.total_shipments),
      metricData(
        'Delay rate',
        firstSummary.delay_rate,
        secondSummary.delay_rate,
        formatPercent,
      ),
      metricData('On-time delivery rate', firstSummary.on_time_delivery_percentage, secondSummary.on_time_delivery_percentage, formatPercent),
    ]
    const firstCarrierData = asChartRows(result.first.analysis.chart_ready?.carrier_performance, carrierKeys)
    const secondCarrierData = asChartRows(result.second.analysis.chart_ready?.carrier_performance, carrierKeys)
    const carrierMap = new Map()
    firstCarrierData.forEach((item) => carrierMap.set(item.name, { carrier: item.name, first: item.value, second: 0 }))
    secondCarrierData.forEach((item) => {
      const current = carrierMap.get(item.name) || { carrier: item.name, first: 0, second: 0 }
      current.second = item.value
      carrierMap.set(item.name, current)
    })
    const hasCarrierSchema = firstColumns.some((column) => carrierKeys.includes(String(column).trim().toLowerCase()))
      && secondColumns.some((column) => carrierKeys.includes(String(column).trim().toLowerCase()))

    return {
      firstColumns,
      secondColumns,
      sharedColumns,
      firstOnly,
      secondOnly,
      metrics,
      carrierRows: [...carrierMap.values()],
      hasCarrierSchema,
      schemaState: firstOnly.length === 0 && secondOnly.length === 0
        ? 'compatible'
        : hasSemanticOverlap(firstColumns, secondColumns) ? 'partial' : 'incompatible',
    }
  }, [result, resultIsCurrent])

  const exportComparison = () => {
    if (!comparison || !result) return
    const filters = 'No filters; full dataset aggregates'
    const metadata = {
      generated_at: result.generatedAt,
      first_dataset: firstDataset?.filename || firstId,
      second_dataset: secondDataset?.filename || secondId,
      filters,
    }
    const reportRows = [
      ...Object.entries(metadata).map(([metric, value]) => ({ metric, value })),
      ...comparison.metrics.map((metric) => ({
        metric: metric.label,
        first_dataset_value: metric.firstValue,
        second_dataset_value: metric.secondValue,
        difference: metric.difference ?? 'Unavailable',
      })),
      ...comparison.carrierRows.map((row) => ({
        metric: `Carrier shipment count: ${row.carrier}`,
        first_dataset_value: row.first,
        second_dataset_value: row.second,
        difference: row.second - row.first,
      })),
    ]
    const rows = reportRows.map((row) => ({
      report_generated_at: metadata.generated_at,
      first_dataset: metadata.first_dataset,
      second_dataset: metadata.second_dataset,
      filters: metadata.filters,
      ...row,
    }))
    try {
      downloadCsv('parcel-ai-dataset-comparison.csv', rows, [
        'report_generated_at',
        'first_dataset',
        'second_dataset',
        'filters',
        'metric',
        'value',
        'first_dataset_value',
        'second_dataset_value',
        'difference',
      ])
      markReportExported(firstId, 'dataset-comparison')
      markReportExported(secondId, 'dataset-comparison')
      setExportError('')
    } catch (downloadError) {
      setExportError(downloadError.message)
    }
  }

  if (datasets.length < 2 && !workspaceReady) {
    return <Card><p role="status" aria-busy="true" className="py-8 text-center text-sm text-slate-500">Loading uploaded datasets…</p></Card>
  }

  if (datasets.length < 2) {
    return (
      <Card><div className="py-10 text-center"><Scale size={28} className="mx-auto text-slate-400" aria-hidden="true" /><h2 className="mt-4 font-semibold text-slate-900">Two uploaded datasets are required</h2><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Upload a second dataset before comparing. Demo samples are intentionally excluded from uploaded-data comparisons.</p><Link to="/upload" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Upload dataset <ArrowRightLeft size={15} aria-hidden="true" /></Link></div></Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">Dataset analysis</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Compare datasets</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Compare backend aggregates from two uploaded datasets. The comparison never includes Demo Mode samples.</p>
      </div>

      <Card>
        <form onSubmit={compare} className="grid gap-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
          <label className="text-xs font-semibold text-slate-600">First dataset
            <select value={firstId} onChange={(event) => { setFirstDatasetId(event.target.value); setResult(null) }} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}
            </select>
          </label>
          <ArrowRightLeft size={18} className="hidden text-slate-400 md:block" aria-hidden="true" />
          <label className="text-xs font-semibold text-slate-600">Second dataset
            <select value={secondId} onChange={(event) => { setSecondDatasetId(event.target.value); setResult(null) }} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
              {datasets.filter((dataset) => dataset.id !== firstId).map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}
            </select>
          </label>
          <button type="submit" disabled={loading || !firstId || !secondId || firstId === secondId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Scale size={16} aria-hidden="true" />} Compare
          </button>
        </form>
      </Card>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      {exportError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{exportError}</p>}

      {comparison && result && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-semibold text-slate-900">Schema compatibility</p><p className="mt-1 text-sm text-slate-600">{comparison.sharedColumns.length} shared column{comparison.sharedColumns.length === 1 ? '' : 's'} · generated {new Date(result.generatedAt).toLocaleString()}</p></div>
              <StatusBadge status={comparison.schemaState === 'compatible' ? 'passed' : comparison.schemaState === 'partial' ? 'warning' : 'failed'} />
            </div>
            {(comparison.firstOnly.length > 0 || comparison.secondOnly.length > 0) && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong className="text-slate-800">Only in {firstDataset?.filename}:</strong> {comparison.firstOnly.join(', ') || 'None'}</p>
                <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong className="text-slate-800">Only in {secondDataset?.filename}:</strong> {comparison.secondOnly.join(', ') || 'None'}</p>
              </div>
            )}
            {comparison.schemaState === 'incompatible' && <p className="mt-3 text-sm text-rose-700">No columns are shared. Shipment volume is still shown if returned, but outcome and carrier comparisons may be unavailable.</p>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {comparison.metrics.map((metric) => <MetricCard key={metric.label} metric={metric} firstName={firstDataset?.filename || 'First dataset'} secondName={secondDataset?.filename || 'Second dataset'} />)}
          </div>

          <Card title="Carrier shipment volume">
            {comparison.hasCarrierSchema && comparison.carrierRows.length
              ? <><DatasetComparisonChart data={comparison.carrierRows} firstName={firstDataset?.filename || 'First dataset'} secondName={secondDataset?.filename || 'Second dataset'} /><p className="mt-2 text-xs leading-5 text-slate-500">The backend returns carrier shipment counts, not carrier-specific delay rates. This chart compares volume only.</p></>
              : <p className="py-10 text-center text-sm text-slate-500">Carrier comparison is unavailable: both datasets need a recognized carrier column and backend carrier aggregates.</p>}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">Export includes both dataset names, generation date, compared metrics, and carrier counts.</p>
            <button type="button" onClick={exportComparison} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Download size={15} aria-hidden="true" /> Export comparison CSV</button>
          </div>
        </>
      )}
    </div>
  )
}

export default DatasetComparisonPage
