import { AlertCircle, BrainCircuit, Download, Loader2, Search, Sparkles } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/common/Card'
import StatusBadge from '../components/common/StatusBadge'
import RiskDistributionChart from '../components/charts/RiskDistributionChart'
import { useAppContext } from '../context/useAppContext'
import { downloadCsv, formatDateTime, formatNumber } from '../utils/data'

const PAGE_SIZE = 25
const probabilityLabel = (probability) =>
  typeof probability === 'number' && Number.isFinite(probability) ? `${(probability * 100).toFixed(1)}%` : '—'
const compareValues = (first, second) =>
  typeof first === 'number' && typeof second === 'number'
    ? first - second
    : String(first ?? '').localeCompare(String(second ?? ''), undefined, { numeric: true, sensitivity: 'base' })

const featureEntries = (value) => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const feature = item?.feature || item?.name
      const importance = item?.importance ?? item?.weight ?? item?.value
      return feature && typeof importance === 'number' && Number.isFinite(importance)
        ? [{ feature, importance }]
        : []
    })
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, importance]) => typeof importance === 'number' && Number.isFinite(importance))
      .map(([feature, importance]) => ({ feature, importance }))
  }
  return []
}

const modelFeatureImportance = (model) =>
  featureEntries(
    model?.feature_importance ||
    model?.feature_importances ||
    model?.metrics?.feature_importance ||
    model?.metrics?.feature_importances,
  )

export const PredictionsPage = () => {
  const {
    createModel,
    createPredictions,
    datasets,
    fetchModels,
    fetchPredictions,
    loading,
    markReportExported,
    models,
    predictions,
    selectedDataset,
    selectedDatasetId,
    setSelectedDatasetId,
    workspaceReady,
  } = useAppContext()
  const [selectedModelId, setSelectedModelId] = useState('')
  const [loadingPage, setLoadingPage] = useState(true)
  const [error, setError] = useState('')
  const [action, setAction] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ column: 'shipment_id', direction: 'asc' })
  const [page, setPage] = useState(1)
  const [exportError, setExportError] = useState('')
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    let active = true
    Promise.allSettled([fetchModels(), fetchPredictions()]).then((results) => {
      if (!active) return
      const failures = results.filter((result) => result.status === 'rejected')
      if (failures.length) setError(failures.map((result) => result.reason.message).join(' '))
      setLoadingPage(false)
    })
    return () => { active = false }
  }, [fetchModels, fetchPredictions])

  const activeModelId = models.some((model) => model.id === selectedModelId)
    ? selectedModelId
    : models[0]?.id || ''
  const datasetPredictions = useMemo(
    () => predictions.filter((prediction) => prediction.dataset_id === selectedDatasetId),
    [predictions, selectedDatasetId],
  )
  const visiblePredictions = useMemo(() => {
    const search = deferredQuery.trim().toLowerCase()
    if (!search) return datasetPredictions
    return datasetPredictions.filter((item) =>
      [item.shipment_id, item.risk_level, item.model_id, item.probability]
        .some((value) => String(value ?? '').toLowerCase().includes(search)),
    )
  }, [datasetPredictions, deferredQuery])
  const sortedPredictions = useMemo(() => {
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...visiblePredictions].sort((first, second) => direction * compareValues(first[sort.column], second[sort.column]))
  }, [visiblePredictions, sort])
  const pageCount = Math.max(1, Math.ceil(sortedPredictions.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pagePredictions = sortedPredictions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const selectedModel = models.find((model) => model.id === activeModelId)
  const importance = modelFeatureImportance(selectedModel)
  const riskCounts = ['low', 'medium', 'high'].map((risk) => ({
    name: risk[0].toUpperCase() + risk.slice(1),
    value: visiblePredictions.filter((item) => String(item.risk_level).toLowerCase() === risk).length,
  })).filter((item) => item.value > 0)

  const handleTrain = async () => {
    setError('')
    setAction('')
    try {
      const model = await createModel(selectedDatasetId)
      setSelectedModelId(model.id)
      setAction(`Model “${model.name}” was trained from the selected dataset.`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const handlePredict = async () => {
    setError('')
    setAction('')
    try {
      const results = await createPredictions(activeModelId, selectedDatasetId)
      setAction(`${formatNumber(results.length)} prediction${results.length === 1 ? '' : 's'} returned by the backend.`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const exportPredictions = () => {
    const generatedAt = new Date().toISOString()
    const rows = visiblePredictions.map((item) => ({
      dataset_name: selectedDataset?.filename || selectedDatasetId,
      filters: query.trim() ? `Search: ${query.trim()}` : 'None',
      report_generated_at: generatedAt,
      shipment_id: item.shipment_id || '',
      delay_probability: item.probability ?? '',
      risk_level: item.risk_level || '',
      model_id: item.model_id || '',
    }))
    try {
      downloadCsv('parcel-ai-filtered-predictions.csv', rows, [
        'dataset_name',
        'filters',
        'report_generated_at',
        'shipment_id',
        'delay_probability',
        'risk_level',
        'model_id',
      ])
      markReportExported(selectedDatasetId, 'filtered-predictions')
      setExportError('')
    } catch (downloadError) {
      setExportError(downloadError.message)
    }
  }

  if (!datasets.length && !workspaceReady) {
    return <Card><p role="status" aria-busy="true" className="py-8 text-center text-sm text-slate-500">Loading prediction workspace…</p></Card>
  }

  if (!datasets.length) {
    return <Card><div className="py-10 text-center"><BrainCircuit size={30} className="mx-auto text-slate-400" aria-hidden="true" /><h2 className="mt-4 font-semibold text-slate-900">A dataset is required</h2><p className="mt-2 text-sm text-slate-600">Upload shipment data before training a model or generating predictions.</p><Link to="/upload" className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Upload dataset</Link></div></Card>
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">Model workspace</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Delay predictions</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Train a delay model from an uploaded dataset and request predictions through the available backend endpoints. No simulated scores are displayed.</p>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Dataset
            <select value={selectedDatasetId} onChange={(event) => { setSelectedDatasetId(event.target.value); setPage(1) }} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}</select>
          </label>
          <label className="text-xs font-semibold text-slate-600">Trained model
            <select value={activeModelId} onChange={(event) => setSelectedModelId(event.target.value)} disabled={!models.length} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50">
              {!models.length && <option value="">No trained models available</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.model_type}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={handleTrain} disabled={loading || loadingPage || !selectedDatasetId} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {loading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <BrainCircuit size={16} aria-hidden="true" />} Train on selected dataset
          </button>
          <button type="button" onClick={handlePredict} disabled={loading || loadingPage || !activeModelId || !selectedDatasetId} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Sparkles size={16} aria-hidden="true" /> Predict selected dataset
          </button>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">The backend requires a supported delay target and enough labeled records for training. If the dataset does not meet those requirements, the server error is shown here.</p>
      </Card>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      {exportError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{exportError}</p>}
      {action && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{action}</p>}

      {loadingPage ? <Card><p role="status" className="py-8 text-center text-sm text-slate-500">Loading models and prediction history…</p></Card> : models.length ? (
        <Card title="Model information">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Model</p><p className="mt-1 font-semibold text-slate-900">{selectedModel?.name || '—'}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Algorithm</p><p className="mt-1 font-semibold text-slate-900">{selectedModel?.model_type || '—'}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Version</p><p className="mt-1 font-semibold text-slate-900">{selectedModel?.version || '—'}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Training date</p><p className="mt-1 font-semibold text-slate-900">{formatDateTime(selectedModel?.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</p></div>
          </div>
          {selectedModel?.metrics && Object.keys(selectedModel.metrics).length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Evaluation metrics returned by the backend</p>
              <div className="flex flex-wrap gap-2">{Object.entries(selectedModel.metrics).filter(([, value]) => typeof value === 'number').map(([key, value]) => <span key={key} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700"><span className="capitalize">{key.replaceAll('_', ' ')}</span>: <strong>{value}</strong></span>)}</div>
            </div>
          )}
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-sm font-semibold text-slate-800">Model-provided feature importance</p>
            {importance.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {importance.map(({ feature, importance: value }) => <li key={feature} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="truncate text-slate-700">{feature}</span><span className="font-semibold text-slate-900">{value}</span></li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">The backend model response does not provide feature importance for this model.</p>}
            <p className="mt-3 text-xs leading-5 text-slate-500">If present, these are model-reported contributing features. They do not establish that a feature causes a delay.</p>
          </div>
        </Card>
      ) : (
        <Card><div className="py-8 text-center"><BrainCircuit size={26} className="mx-auto text-slate-400" aria-hidden="true" /><h3 className="mt-3 font-semibold text-slate-900">No trained model available</h3><p className="mt-2 text-sm text-slate-600">Train a model using a dataset with the required historical delivery outcome fields.</p></div></Card>
      )}

      {visiblePredictions.length ? (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.7fr)]">
            <Card title="Prediction summary">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-slate-500">Predictions</p><p className="mt-2 text-2xl font-bold text-slate-950">{formatNumber(visiblePredictions.length)}</p></div>
                <div className="rounded-xl bg-rose-50 p-4"><p className="text-sm text-rose-700">High risk</p><p className="mt-2 text-2xl font-bold text-rose-800">{formatNumber(visiblePredictions.filter((item) => item.risk_level === 'high').length)}</p></div>
                <div className="rounded-xl bg-amber-50 p-4"><p className="text-sm text-amber-700">Medium risk</p><p className="mt-2 text-2xl font-bold text-amber-800">{formatNumber(visiblePredictions.filter((item) => item.risk_level === 'medium').length)}</p></div>
              </div>
            </Card>
            <Card title="Risk distribution">{riskCounts.length ? <RiskDistributionChart data={riskCounts} /> : <p className="py-10 text-center text-sm text-slate-500">No categorized predictions were returned.</p>}</Card>
          </div>
          <Card title="Prediction results">
            <label className="relative mb-4 block max-w-sm">
              <span className="sr-only">Filter prediction results</span>
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Filter by shipment, risk, or model" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
                  {[
                    ['shipment_id', 'Shipment ID'],
                    ['probability', 'Delay probability'],
                    ['risk_level', 'Risk category'],
                    ['model_id', 'Model ID'],
                  ].map(([column, label]) => {
                    const direction = sort.column === column ? sort.direction : ''
                    return <th key={column} aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => { setSort({ column, direction: direction === 'asc' ? 'desc' : 'asc' }); setPage(1) }} className="min-h-8 rounded px-1 text-left hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{label}{direction ? (direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</button></th>
                  })}
                </tr></thead>
                <tbody>{pagePredictions.map((item, index) => <tr key={item.id || `${item.shipment_id}-${index}`} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-900">{item.shipment_id || '—'}</td><td className="px-4 py-3 text-slate-700">{probabilityLabel(item.probability)}</td><td className="px-4 py-3"><StatusBadge status={item.risk_level || 'unknown'} /></td><td className="max-w-56 truncate px-4 py-3 text-slate-500">{item.model_id || '—'}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span aria-live="polite">{sortedPredictions.length} matching prediction{sortedPredictions.length === 1 ? '' : 's'} · Page {currentPage} of {pageCount}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button>
                <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button>
              </div>
            </div>
            <button type="button" onClick={exportPredictions} disabled={!visiblePredictions.length || query !== deferredQuery} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={15} aria-hidden="true" /> Export filtered predictions CSV</button>
            {query !== deferredQuery && <p role="status" className="mt-2 text-xs text-slate-500">Filtering prediction results…</p>}
            <p className="mt-3 text-xs leading-5 text-slate-500">The service returns risk labels and probabilities. Risk thresholds are determined by the backend model service.</p>
          </Card>
          {pagePredictions.some((item) => item.explanation || item.feature_importance || item.prediction?.explanation || item.prediction?.feature_importance) && (
            <Card title="Prediction explanations returned by the model">
              <div className="space-y-3">
                {pagePredictions.filter((item) => item.explanation || item.feature_importance || item.prediction?.explanation || item.prediction?.feature_importance).map((item) => {
                  const details = item.prediction || {}
                  const explanation = item.explanation || details.explanation
                  const factors = featureEntries(item.feature_importance || details.feature_importance)
                  return <div key={item.id || item.shipment_id} className="rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold text-slate-900">Shipment {item.shipment_id || '—'}</p>{typeof explanation === 'string' && <p className="mt-2 text-sm text-slate-600">{explanation}</p>}{explanation && typeof explanation === 'object' && <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(explanation, null, 2)}</pre>}{factors.length > 0 && <ul className="mt-2 flex flex-wrap gap-2">{factors.map(({ feature, importance: value }) => <li key={feature} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{feature}: {value}</li>)}</ul>}</div>
                })}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">Model-provided explanations describe contributing signals and do not prove causality.</p>
            </Card>
          )}
        </>
      ) : datasetPredictions.length && deferredQuery ? (
        <Card><div className="py-8 text-center"><p className="font-semibold text-slate-900">No predictions match this filter</p><button type="button" onClick={() => setQuery('')} className="mt-3 min-h-11 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">Clear search</button></div></Card>
      ) : (
        <Card><div className="py-8 text-center"><p className="font-semibold text-slate-900">No predictions for this dataset yet</p><p className="mt-2 text-sm text-slate-600">{activeModelId ? 'Generate predictions to see backend results here.' : 'Train a model first, then request predictions.'}</p></div></Card>
      )}
    </div>
  )
}

export default PredictionsPage
