import { AlertCircle, BarChart3, CalendarRange, Download, Loader2, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/common/Card'
import CarrierPerformanceChart from '../components/charts/CarrierPerformanceChart'
import DeliveryTrendChart from '../components/charts/DeliveryTrendChart'
import WarehousePerformanceChart from '../components/charts/WarehousePerformanceChart'
import { useAppContext } from '../context/useAppContext'
import { getDatasetAnalysis } from '../services/api'
import { asChartRows, downloadCsv, formatNumber, formatPercent } from '../utils/data'

const EmptyChart = ({ children }) => (
  <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">{children}</div>
)
const EMPTY_CHART_DATA = {}

const ChoiceFilter = ({ label, value, options, onChange }) => (
  <label className="text-xs font-medium text-slate-600">
    <span className="mb-1 block">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className="min-w-36 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
      <option value="">All {label.toLowerCase()}</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
)

export const AnalyticsPage = () => {
  const { analysis, analyzeSelectedDataset, datasets, loading, markReportExported, selectedDataset, selectedDatasetId, setAnalysis, setSelectedDatasetId, workspaceReady } = useAppContext()
  const [analysisRequest, setAnalysisRequest] = useState({ datasetId: '', error: '' })
  const [exportError, setExportError] = useState('')
  const [carrier, setCarrier] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  useEffect(() => {
    let active = true
    if (!selectedDatasetId || analysis?.dataset_id === selectedDatasetId) return undefined
    getDatasetAnalysis(selectedDatasetId)
      .then(({ data }) => {
        if (active) {
          setAnalysis(data)
          setAnalysisRequest({ datasetId: selectedDatasetId, error: '' })
        }
      })
      .catch((requestError) => {
        if (active) {
          setAnalysisRequest({
            datasetId: selectedDatasetId,
            error: requestError.status === 404 ? '' : requestError.message,
          })
        }
      })
    return () => { active = false }
  }, [selectedDatasetId, analysis?.dataset_id, setAnalysis])

  const currentAnalysis = analysis?.dataset_id === selectedDatasetId ? analysis : null
  const loadingSaved = Boolean(selectedDatasetId && !currentAnalysis && analysisRequest.datasetId !== selectedDatasetId)
  const error = analysisRequest.datasetId === selectedDatasetId ? analysisRequest.error : ''
  const chartData = currentAnalysis?.chart_ready || EMPTY_CHART_DATA
  const summary = currentAnalysis?.summary || {}
  const carrierRows = useMemo(
    () => asChartRows(chartData.carrier_performance, ['carrier', 'carrier_name', 'shipping_carrier', 'name']),
    [chartData.carrier_performance],
  )
  const warehouseRows = useMemo(
    () => asChartRows(chartData.warehouse_performance, ['origin_warehouse', 'warehouse', 'warehouse_id', 'name']),
    [chartData.warehouse_performance],
  )
  const destinationRows = useMemo(
    () => asChartRows(chartData.destination_performance, ['destination', 'destination_city', 'destination_warehouse', 'name']),
    [chartData.destination_performance],
  )
  const trendRows = useMemo(
    () => (Array.isArray(chartData.daily_trends) ? chartData.daily_trends : []).filter((row) =>
      (!fromDate || row.date >= fromDate) && (!toDate || row.date <= toDate),
    ),
    [chartData.daily_trends, fromDate, toDate],
  )
  const visibleCarriers = carrier ? carrierRows.filter((row) => row.name === carrier) : carrierRows
  const visibleWarehouses = warehouse ? warehouseRows.filter((row) => row.name === warehouse) : warehouseRows
  const invalidDateRange = Boolean(fromDate && toDate && fromDate > toDate)

  const runAnalysis = async () => {
    try {
      await analyzeSelectedDataset()
      setAnalysisRequest({ datasetId: selectedDatasetId, error: '' })
    } catch (requestError) {
      setAnalysisRequest({ datasetId: selectedDatasetId, error: requestError.message })
    }
  }

  const exportAnalytics = () => {
    if (!currentAnalysis) return
    const generatedAt = new Date().toISOString()
    const filters = JSON.stringify({ carrier: carrier || 'all', warehouse: warehouse || 'all', from: fromDate || null, to: toDate || null })
    const metricRows = [
      ['Total shipments', summary.total_shipments],
      ['Delayed shipments', summary.late_shipments],
      ['On-time shipments', summary.on_time_shipments],
      ['On-time delivery rate (%)', summary.on_time_delivery_percentage],
      ['Average delay duration (hours)', summary.average_delay_duration_hours],
    ].filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
      .map(([metric, value]) => ({ metric, value }))
    const chartRows = [
      ...trendRows.map((row) => ({ metric: `Daily shipments: ${row.date}`, value: row.shipments })),
      ...visibleCarriers.map((row) => ({ metric: `Carrier shipments: ${row.name}`, value: row.value })),
      ...visibleWarehouses.map((row) => ({ metric: `Warehouse shipments: ${row.name}`, value: row.value })),
    ]
    const rows = [...metricRows, ...chartRows].map((row) => ({
      dataset_name: selectedDataset?.filename || selectedDatasetId,
      filters,
      report_generated_at: generatedAt,
      ...row,
    }))
    try {
      downloadCsv('parcel-ai-analytics-summary.csv', rows, [
        'dataset_name',
        'filters',
        'report_generated_at',
        'metric',
        'value',
      ])
      markReportExported(selectedDatasetId, 'analytics-summary')
      setExportError('')
    } catch (downloadError) {
      setExportError(downloadError.message)
    }
  }

  if (!datasets.length && !workspaceReady) {
    return <Card><p role="status" aria-busy="true" className="py-8 text-center text-sm text-slate-500">Loading dataset analytics…</p></Card>
  }

  if (!datasets.length) {
    return <Card><div className="py-10 text-center"><BarChart3 size={28} className="mx-auto text-slate-400" aria-hidden="true" /><h2 className="mt-4 font-semibold text-slate-900">Analytics needs a dataset</h2><p className="mt-2 text-sm text-slate-600">Upload shipment data before running analytics.</p><Link to="/upload" className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Upload dataset</Link></div></Card>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold text-blue-700">Operational insights</p><h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Analytics</h2><p className="mt-2 text-sm text-slate-600">Aggregates are calculated by the backend from the selected dataset.</p></div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="analytics-dataset" className="sr-only">Select analytics dataset</label>
          <select id="analytics-dataset" value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)} className="min-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}</select>
          <button type="button" onClick={runAnalysis} disabled={loading || loadingSaved} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <BarChart3 size={16} aria-hidden="true" />}{currentAnalysis ? 'Refresh analysis' : 'Analyze dataset'}</button>
        </div>
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">Dataset: <span className="font-semibold">{selectedDataset?.filename || '—'}</span>. The current API provides dataset-level aggregates; carrier, warehouse, and date filters below refine the returned chart data.</div>
      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      {exportError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{exportError}</p>}

      {loadingSaved ? <Card><p role="status" className="py-8 text-center text-sm text-slate-500">Loading saved analysis…</p></Card> : currentAnalysis ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Total shipments</p><p className="mt-3 text-2xl font-bold text-slate-950">{formatNumber(summary.total_shipments)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Delayed shipments</p><p className="mt-3 text-2xl font-bold text-amber-700">{formatNumber(summary.late_shipments)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">On-time delivery</p><p className="mt-3 text-2xl font-bold text-emerald-700">{formatPercent(summary.on_time_delivery_percentage)}</p></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">Average delay</p><p className="mt-3 text-2xl font-bold text-slate-950">{typeof summary.average_delay_duration_hours === 'number' ? `${formatNumber(summary.average_delay_duration_hours)} h` : '—'}</p></div>
          </div>

          <Card>
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div><div className="flex items-center gap-2"><CalendarRange size={17} className="text-blue-700" aria-hidden="true" /><h3 className="text-sm font-semibold text-slate-900">Filter chart data</h3></div><p className="mt-1 text-xs text-slate-500">Filters apply to the corresponding chart only; summary figures remain dataset-wide.</p></div>
              <div className="flex flex-wrap items-end gap-3">
                <ChoiceFilter label="Carrier" value={carrier} options={carrierRows.map((row) => row.name)} onChange={setCarrier} />
                <ChoiceFilter label="Warehouse" value={warehouse} options={warehouseRows.map((row) => row.name)} onChange={setWarehouse} />
                <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none" /></label>
                <label className="text-xs font-medium text-slate-600"><span className="mb-1 block">To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-sm focus:border-blue-500 focus:outline-none" /></label>
                <button type="button" onClick={() => { setCarrier(''); setWarehouse(''); setFromDate(''); setToDate('') }} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"><RotateCcw size={14} aria-hidden="true" /> Reset</button>
              </div>
            </div>
            {invalidDateRange && <p role="alert" className="mt-3 text-sm text-rose-700">The start date must be on or before the end date.</p>}
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Daily shipment volume">{trendRows.length ? <DeliveryTrendChart data={trendRows} /> : <EmptyChart>No daily trend data matches this date range or the required date field was not found.</EmptyChart>}</Card>
            <Card title="Shipment volume by carrier">{visibleCarriers.length ? <CarrierPerformanceChart data={visibleCarriers} /> : <EmptyChart>Carrier shipment counts are not available.</EmptyChart>}</Card>
            <Card title="Shipment volume by warehouse">{visibleWarehouses.length ? <WarehousePerformanceChart data={visibleWarehouses} /> : <EmptyChart>Warehouse shipment counts are not available.</EmptyChart>}</Card>
            <Card title="Shipment volume by destination">{destinationRows.length ? <CarrierPerformanceChart data={destinationRows} /> : <EmptyChart>Destination shipment counts are not available.</EmptyChart>}</Card>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-sm text-slate-600">Summary metrics remain dataset-wide; chart rows reflect the selected chart filters.</p>
            <button type="button" onClick={exportAnalytics} disabled={invalidDateRange} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={15} aria-hidden="true" /> Export filtered analytics CSV</button>
          </div>
        </>
      ) : (
        <Card><div className="py-10 text-center"><BarChart3 size={28} className="mx-auto text-slate-400" aria-hidden="true" /><h3 className="mt-4 font-semibold text-slate-900">No analysis available</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Run the backend analysis for {selectedDataset?.filename || 'this dataset'}. Charts will appear only for columns detected in the source file.</p><button type="button" onClick={runAnalysis} disabled={loading} className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Analyze dataset</button></div></Card>
      )}
    </div>
  )
}

export default AnalyticsPage
