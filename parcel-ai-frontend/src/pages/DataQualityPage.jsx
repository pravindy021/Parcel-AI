import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/common/Card'
import StatusBadge from '../components/common/StatusBadge'
import { useAppContext } from '../context/useAppContext'
import { getDatasetValidation } from '../services/api'
import { formatNumber } from '../utils/data'

const summaryCard = (label, value, note) => (
  <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-sm text-slate-500">{label}</p>
    <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{formatNumber(value)}</p>
    <p className="mt-1 text-xs text-slate-500">{note}</p>
  </div>
)

export const DataQualityPage = () => {
  const {
    datasets,
    loading,
    selectedDataset,
    selectedDatasetId,
    setSelectedDatasetId,
    setValidation,
    validateSelectedDataset,
    validation,
    workspaceReady,
  } = useAppContext()
  const [validationRequest, setValidationRequest] = useState({ datasetId: '', error: '' })
  const currentValidation = validation?.dataset_id === selectedDatasetId ? validation : null
  const loadingExisting = Boolean(selectedDatasetId && validationRequest.datasetId !== selectedDatasetId)
  const error = validationRequest.datasetId === selectedDatasetId ? validationRequest.error : ''

  useEffect(() => {
    let active = true
    if (!selectedDatasetId) return () => { active = false }
    getDatasetValidation(selectedDatasetId)
      .then(({ data }) => {
        if (active) {
          setValidation(data)
          setValidationRequest({ datasetId: selectedDatasetId, error: '' })
        }
      })
      .catch((requestError) => {
        if (active) {
          setValidationRequest({
            datasetId: selectedDatasetId,
            error: requestError.status === 404 ? '' : requestError.message,
          })
        }
      })
    return () => { active = false }
  }, [selectedDatasetId, setValidation])

  const runValidation = async () => {
    setValidationRequest({ datasetId: selectedDatasetId, error: '' })
    try {
      await validateSelectedDataset()
    } catch (requestError) {
      setValidationRequest({ datasetId: selectedDatasetId, error: requestError.message })
    }
  }

  if (!datasets.length && !workspaceReady) {
    return <Card><p role="status" aria-busy="true" className="py-8 text-center text-sm text-slate-500">Loading validation workspace…</p></Card>
  }

  if (!datasets.length) {
    return (
      <Card>
        <div className="py-10 text-center">
          <ShieldCheck className="mx-auto text-slate-400" size={30} aria-hidden="true" />
          <h2 className="mt-4 font-semibold text-slate-900">No dataset to validate</h2>
          <p className="mt-2 text-sm text-slate-600">Upload shipment data before running quality checks.</p>
          <Link to="/upload" className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Upload dataset</Link>
        </div>
      </Card>
    )
  }

  const stats = currentValidation?.column_stats && typeof currentValidation.column_stats === 'object' ? Object.entries(currentValidation.column_stats) : []

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-700">Validation workspace</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Data quality</h2>
          <p className="mt-2 text-sm text-slate-600">Inspect only the checks returned by the validation service.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label htmlFor="quality-dataset" className="sr-only">Select dataset to validate</label>
          <select id="quality-dataset" value={selectedDatasetId} onChange={(event) => setSelectedDatasetId(event.target.value)} className="min-w-52 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
            {datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.filename}</option>)}
          </select>
          <button type="button" onClick={runValidation} disabled={loading || loadingExisting || !selectedDatasetId} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
            Run checks
          </button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected dataset</p><p className="mt-1 font-semibold text-slate-900">{selectedDataset?.filename || '—'}</p></div>
          {currentValidation && <StatusBadge status={currentValidation.status || 'not_checked'} />}
        </div>
      </Card>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}

      {loadingExisting ? (
        <Card><p role="status" className="py-8 text-center text-sm text-slate-500">Loading validation report…</p></Card>
      ) : currentValidation ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCard('Total records', currentValidation.total_records, 'Reported by validation API')}
            {summaryCard('Valid records', currentValidation.valid_records, 'Reported by validation API')}
            {summaryCard('Invalid records', currentValidation.invalid_records, 'Reported by validation API')}
            {summaryCard('Missing values', currentValidation.missing_values, 'Cell values reported missing')}
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Validation findings">
              <div className="space-y-4">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><AlertCircle size={16} className="text-rose-600" aria-hidden="true" /> Errors ({currentValidation.errors?.length || 0})</h3>
                  {currentValidation.errors?.length ? <ul className="mt-3 space-y-2">{currentValidation.errors.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm text-rose-800">{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No errors were returned.</p>}
                </div>
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CheckCircle2 size={16} className="text-amber-600" aria-hidden="true" /> Warnings ({currentValidation.warnings?.length || 0})</h3>
                  {currentValidation.warnings?.length ? <ul className="mt-3 space-y-2">{currentValidation.warnings.map((item, index) => <li key={`${item}-${index}`} className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No warnings were returned.</p>}
                </div>
              </div>
            </Card>
            <Card title="Column profile">
              {stats.length ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2.5">Column</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Missing</th><th className="px-3 py-2.5">Unique</th></tr></thead>
                    <tbody>{stats.map(([column, stat]) => <tr key={column} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-800">{column}</td><td className="px-3 py-2.5 text-slate-600">{stat?.dtype || '—'}</td><td className="px-3 py-2.5 text-slate-600">{formatNumber(stat?.null_count)}</td><td className="px-3 py-2.5 text-slate-600">{formatNumber(stat?.unique_values)}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-slate-500">The backend did not return per-column statistics.</p>}
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <div className="py-10 text-center">
            <ShieldCheck className="mx-auto text-slate-400" size={28} aria-hidden="true" />
            <h3 className="mt-4 font-semibold text-slate-900">No validation report yet</h3>
            <p className="mt-2 text-sm text-slate-600">Run the backend checks to inspect required columns, duplicate records, missing values, and supported field issues.</p>
          </div>
        </Card>
      )}
    </div>
  )
}

export default DataQualityPage
