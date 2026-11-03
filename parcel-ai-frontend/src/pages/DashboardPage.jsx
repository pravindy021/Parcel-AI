import { Activity, ArrowRight, BarChart3, Database, FlaskConical, RefreshCw, ShieldCheck, Truck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/common/Card'
import StatCard from '../components/common/StatCard'
import CarrierPerformanceChart from '../components/charts/CarrierPerformanceChart'
import DeliveryTrendChart from '../components/charts/DeliveryTrendChart'
import WarehousePerformanceChart from '../components/charts/WarehousePerformanceChart'
import WorkflowProgress from '../components/common/WorkflowProgress'
import { useAppContext } from '../context/useAppContext'
import { getDatasetPreview } from '../services/api'
import { asChartRows, formatNumber, formatPercent } from '../utils/data'
import { demoCarrierVolume, demoDailyTrend, demoMetrics, demoShipments, demoWarehouseVolume } from '../utils/demoData'

const EmptyChart = ({ children }) => (
  <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
    {children}
  </div>
)

const RealDashboard = () => {
  const {
    analysis,
    analyzeSelectedDataset,
    datasets,
    loading,
    selectedDataset,
    selectedDatasetId,
    setSelectedDatasetId,
    workspaceReady,
  } = useAppContext()
  const [previewState, setPreviewState] = useState({ datasetId: '', data: null, error: '' })
  const [analysisError, setAnalysisError] = useState('')

  useEffect(() => {
    if (!selectedDatasetId) return undefined
    let active = true
    getDatasetPreview(selectedDatasetId, 10)
      .then(({ data }) => {
        if (active) setPreviewState({ datasetId: selectedDatasetId, data, error: '' })
      })
      .catch((error) => {
        if (active) setPreviewState({ datasetId: selectedDatasetId, data: null, error: error.message })
      })
    return () => {
      active = false
    }
  }, [selectedDatasetId])

  const summary = analysis?.dataset_id === selectedDatasetId ? analysis.summary : null
  const chartData = analysis?.dataset_id === selectedDatasetId ? analysis.chart_ready : null
  const preview = previewState.datasetId === selectedDatasetId ? previewState.data : null
  const previewError = previewState.datasetId === selectedDatasetId ? previewState.error : ''
  const previewLoading = Boolean(selectedDatasetId && previewState.datasetId !== selectedDatasetId)
  const carrierRows = useMemo(
    () => asChartRows(chartData?.carrier_performance, ['carrier', 'carrier_name', 'shipping_carrier', 'name']),
    [chartData],
  )
  const warehouseRows = useMemo(
    () => asChartRows(chartData?.warehouse_performance, ['origin_warehouse', 'warehouse', 'warehouse_id', 'name']),
    [chartData],
  )
  const dailyRows = Array.isArray(chartData?.daily_trends) ? chartData.daily_trends : []
  const columns = (preview?.columns || []).slice(0, 5)

  const runAnalysis = async () => {
    setAnalysisError('')
    try {
      await analyzeSelectedDataset()
    } catch (error) {
      setAnalysisError(error.message)
    }
  }

  if (!datasets.length && !workspaceReady) {
    return <div role="status" aria-busy="true" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm font-medium text-slate-600">Loading workspace data…</p><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)}</div></div>
  }

  if (!datasets.length) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
          <Database size={25} aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-xl font-semibold text-slate-900">Start with a shipment dataset</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">
          Upload a CSV or Excel file to validate its structure and create analytics from the records your backend receives.
        </p>
        <Link to="/upload" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          Upload dataset <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-sm text-slate-500">Dataset workspace</p>
          <p className="mt-1 font-semibold text-slate-900">{selectedDataset?.filename || 'Select a dataset'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="dashboard-dataset" className="sr-only">Select dataset</label>
          <select
            id="dashboard-dataset"
            value={selectedDatasetId}
            onChange={(event) => setSelectedDatasetId(event.target.value)}
            className="min-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}
          </select>
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading || !selectedDatasetId}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {summary ? 'Refresh analysis' : 'Run analysis'}
          </button>
        </div>
      </div>

      {analysisError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{analysisError}</p>}

      {summary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total shipments" value={formatNumber(summary.total_shipments)} detail="Records in dataset" tooltip="Count of shipment records returned by backend analysis." tone="info" />
            <StatCard label="Delayed shipments" value={formatNumber(summary.late_shipments)} detail="Based on available delivery fields" tooltip="Late shipments as classified from supported delivery fields in the uploaded dataset." tone="warning" />
            <StatCard label="On-time delivery" value={formatPercent(summary.on_time_delivery_percentage)} detail={summary.on_time_shipments !== undefined ? `${formatNumber(summary.on_time_shipments)} shipments` : 'Not available'} tooltip="On-time delivery percentage as calculated and returned by the backend." tone="success" />
            <StatCard label="Average delay" value={typeof summary.average_delay_duration_hours === 'number' ? `${formatNumber(summary.average_delay_duration_hours)} h` : '—'} detail="Delayed shipments only" tooltip="Average delay duration in hours for delayed shipments, when provided by backend analysis." tone="neutral" />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Shipment volume over time">
              {dailyRows.length ? <DeliveryTrendChart data={dailyRows} /> : <EmptyChart>Time-based counts are unavailable for this dataset. A shipment creation date column is needed.</EmptyChart>}
            </Card>
            <Card title="Shipment count by carrier">
              {carrierRows.length ? <CarrierPerformanceChart data={carrierRows} /> : <EmptyChart>No carrier column was detected in the analysis response.</EmptyChart>}
            </Card>
            <Card title="Shipment count by warehouse">
              {warehouseRows.length ? <WarehousePerformanceChart data={warehouseRows} /> : <EmptyChart>No warehouse column was detected in the analysis response.</EmptyChart>}
            </Card>
            <Card title="Analysis coverage">
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                  <Activity size={18} className="mt-0.5 text-blue-700" aria-hidden="true" />
                  <div><p className="text-sm font-semibold text-slate-800">Available measures</p><p className="mt-1 text-sm text-slate-600">Metrics are shown only when the uploaded columns support them.</p></div>
                </div>
                <Link to="/analytics" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800">
                  Explore analytics <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </Card>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <BarChart3 className="mx-auto text-slate-400" size={28} aria-hidden="true" />
          <h2 className="mt-4 text-lg font-semibold text-slate-900">Analysis has not been generated</h2>
          <p className="mt-2 text-sm text-slate-600">Run analysis to calculate the metrics and charts available for this dataset.</p>
          <button type="button" onClick={runAnalysis} disabled={loading} className="mt-5 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? 'Analyzing…' : 'Analyze dataset'}
          </button>
        </div>
      )}

      <Card title="Recent dataset rows">
        {!selectedDatasetId ? (
          <EmptyChart>Select a dataset to preview its rows.</EmptyChart>
        ) : previewLoading ? (
          <p className="py-8 text-center text-sm text-slate-500" role="status">Loading dataset rows…</p>
        ) : previewError ? (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{previewError}</p>
        ) : preview?.rows?.length && columns.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <th key={column} className="whitespace-nowrap px-4 py-3">{column}</th>)}</tr></thead>
              <tbody>{preview.rows.slice(0, 5).map((row, index) => <tr key={`${row.shipment_id || index}`} className="border-t border-slate-100">{columns.map((column) => <td key={column} className="max-w-64 truncate whitespace-nowrap px-4 py-3 text-slate-700">{String(row[column] ?? '—')}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500">No preview rows were returned for this dataset.</div>
        )}
        {preview?.total_rows > 0 && <Link to={`/datasets/${selectedDatasetId}`} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue-700">Open full preview <ArrowRight size={14} aria-hidden="true" /></Link>}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link to="/data-quality" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50/40">
          <ShieldCheck className="text-blue-700" size={19} aria-hidden="true" /> Run and review dataset validation
        </Link>
        <Link to="/predictions" className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 hover:border-blue-200 hover:bg-blue-50/40">
          <Truck className="text-blue-700" size={19} aria-hidden="true" /> View model training and predictions
        </Link>
      </div>
    </div>
  )
}

const DemoDashboard = () => (
  <div className="space-y-6">
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
      <FlaskConical size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div><p className="font-semibold">Demo Mode — illustrative sample data</p><p className="mt-1 text-sm leading-6">These fictional rows and metrics are for UI demonstration only. They are isolated from uploaded datasets, are not sent to the backend, and include no simulated ML predictions.</p></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Demo shipment volume" value={formatNumber(demoMetrics.total_shipments)} detail="Illustrative sample" tone="info" />
      <StatCard label="Demo delayed shipments" value={formatNumber(demoMetrics.late_shipments)} detail="Illustrative sample" tone="warning" />
      <StatCard label="Demo on-time delivery" value={formatPercent(demoMetrics.on_time_delivery_percentage)} detail="Illustrative sample" tone="success" />
      <StatCard label="Demo average delay" value={`${demoMetrics.average_delay_duration_hours} h`} detail="Illustrative sample" tone="neutral" />
    </div>
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Demo shipment volume over time"><DeliveryTrendChart data={demoDailyTrend} /></Card>
      <Card title="Demo carrier shipment volume"><CarrierPerformanceChart data={demoCarrierVolume} /></Card>
      <Card title="Demo warehouse shipment volume"><WarehousePerformanceChart data={demoWarehouseVolume} /></Card>
      <Card title="Demo data boundary">
        <p className="text-sm leading-6 text-slate-600">Demo Mode only displays the local sample below. It does not change the selected dataset, invoke analytics or prediction APIs, or affect real dataset reports.</p>
        <p className="mt-3 text-xs leading-5 text-slate-500">The sample numbers do not describe actual Parcel-AI users, customers, carriers, or operational performance.</p>
      </Card>
    </div>
    <Card title="Fictional demo shipment rows">
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{Object.keys(demoShipments[0]).map((column) => <th key={column} className="whitespace-nowrap px-4 py-3">{column.replaceAll('_', ' ')}</th>)}</tr></thead>
          <tbody>{demoShipments.map((row) => <tr key={row.shipment_id} className="border-t border-slate-100">{Object.values(row).map((value, index) => <td key={`${row.shipment_id}-${index}`} className="whitespace-nowrap px-4 py-3 text-slate-700">{value}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Card>
  </div>
)

export const DashboardPage = () => {
  const [demoMode, setDemoMode] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div><p className="text-sm font-semibold text-slate-900">Workspace data</p><p className="mt-1 text-xs text-slate-500">{demoMode ? 'Showing isolated fictional demo data' : 'Showing data returned for uploaded datasets'}</p></div>
        <button type="button" aria-pressed={demoMode} onClick={() => setDemoMode((current) => !current)} className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${demoMode ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
          <FlaskConical size={16} aria-hidden="true" /> Demo Mode: {demoMode ? 'On' : 'Off'}
        </button>
      </div>
      {demoMode ? <DemoDashboard /> : <><WorkflowProgress /><RealDashboard /></>}
    </div>
  )
}

export default DashboardPage
