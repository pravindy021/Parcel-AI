import { AlertCircle, Download, FileJson, FileSpreadsheet, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Card } from '../components/common/Card'
import { useAppContext } from '../context/useAppContext'
import { downloadReport, getDatasetPreview } from '../services/api'
import { downloadCsv, downloadJson } from '../utils/data'

export const ReportsPage = () => {
  const { analysis, datasets, markReportExported, selectedDataset, selectedDatasetId, validation } = useAppContext()
  const [previewState, setPreviewState] = useState({ datasetId: '', data: null, error: '' })
  const [previewVersion, setPreviewVersion] = useState(0)
  const [busyReport, setBusyReport] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    if (!selectedDatasetId) return undefined
    getDatasetPreview(selectedDatasetId, 50)
      .then(({ data }) => {
        if (active) setPreviewState({ datasetId: selectedDatasetId, data, error: '' })
      })
      .catch((requestError) => {
        if (active) setPreviewState({ datasetId: selectedDatasetId, data: null, error: requestError.message })
      })
    return () => { active = false }
  }, [selectedDatasetId, previewVersion])

  const preview = previewState.datasetId === selectedDatasetId ? previewState.data : null
  const loadingPreview = Boolean(selectedDatasetId && previewState.datasetId !== selectedDatasetId)
  const previewError = previewState.datasetId === selectedDatasetId ? previewState.error : ''
  const exportJson = (filename, payload) => {
    setError('')
    try {
      downloadJson(filename, {
        dataset: selectedDataset?.filename || selectedDatasetId,
        filters: 'None',
        report_generated_at: new Date().toISOString(),
        report: payload,
      })
      markReportExported(selectedDatasetId, filename)
    } catch (exportError) {
      setError(exportError.message)
    }
  }

  const handleBackendDownload = async (key, label, reportId) => {
    setBusyReport(key)
    setError('')
    try {
      const { data } = await downloadReport(reportId)
      downloadJson(`parcel-ai-${label.toLowerCase().replaceAll(' ', '-')}.json`, {
        dataset: selectedDataset?.filename || selectedDatasetId,
        filters: 'None',
        report_generated_at: new Date().toISOString(),
        report: data.download || data,
      })
      markReportExported(selectedDatasetId, key)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusyReport('')
    }
  }

  const reportCards = [
    ...(analysis?.dataset_id === selectedDatasetId ? [{
      key: 'analysis',
      title: 'Shipment analysis',
      description: 'Export the summary and chart aggregates returned for the selected dataset.',
      icon: FileJson,
      action: () => analysis.report_id
        ? handleBackendDownload('analysis', 'analysis-report', analysis.report_id)
        : exportJson('parcel-ai-analysis.json', analysis),
      actionLabel: analysis?.report_id ? 'Download backend report' : 'Export analysis JSON',
    }] : []),
    ...(validation?.dataset_id === selectedDatasetId ? [{
      key: 'validation',
      title: 'Data quality report',
      description: 'Download the latest validation result and its column-level statistics.',
      icon: FileJson,
      action: () => validation.report_id
        ? handleBackendDownload('validation', 'validation-report', validation.report_id)
        : exportJson('parcel-ai-validation.json', validation),
      actionLabel: validation?.report_id ? 'Download backend report' : 'Export validation JSON',
    }] : []),
    ...(preview?.rows?.length ? [{
      key: 'preview',
      title: 'Dataset preview export',
      description: `Export up to ${preview.rows.length} preview rows from ${selectedDataset?.filename || 'the selected dataset'} (not the full stored file).`,
      icon: FileSpreadsheet,
      action: () => {
        setError('')
        try {
          const generatedAt = new Date().toISOString()
          const rows = preview.rows.map((row) => ({
            ...row,
            dataset_name: selectedDataset?.filename || selectedDatasetId,
            filters: 'None; dataset preview limited to 50 returned rows',
            report_generated_at: generatedAt,
          }))
          downloadCsv('parcel-ai-dataset-preview.csv', rows, [
            ...(preview.columns || []),
            'dataset_name',
            'filters',
            'report_generated_at',
          ])
          markReportExported(selectedDatasetId, 'dataset-preview')
        } catch (exportError) {
          setError(exportError.message)
        }
      },
      actionLabel: 'Export preview CSV',
    }] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">Exports and summaries</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Reports</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">The backend can download a report when its report ID is available. The current API does not expose a report listing or report-generation endpoint.</p>
      </div>

      <Card>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active dataset</p><p className="mt-1 font-semibold text-slate-900">{selectedDataset?.filename || 'No dataset selected'}</p></div>
          <span className="text-sm text-slate-500">{datasets.length} dataset{datasets.length === 1 ? '' : 's'} available</span>
        </div>
      </Card>

      {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>}
      {previewError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />{previewError}</span><button type="button" onClick={() => setPreviewVersion((version) => version + 1)} className="min-h-11 rounded-lg border border-rose-200 bg-white px-3 py-2 font-semibold text-rose-800 hover:bg-rose-100">Retry preview</button></div>}

      {loadingPreview ? <Card><p role="status" className="py-6 text-center text-sm text-slate-500">Loading available dataset preview…</p></Card> : reportCards.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {reportCards.map(({ key, title, description, icon: Icon, action, actionLabel }) => (
            <Card key={key}>
              <div className="flex items-start gap-3">
                <span className="rounded-xl bg-blue-50 p-2.5 text-blue-700"><Icon size={20} aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><h3 className="font-semibold text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>
              </div>
              <button type="button" onClick={action} disabled={Boolean(busyReport)} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                {busyReport === key ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}{actionLabel}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Card><div className="py-10 text-center"><FileJson className="mx-auto text-slate-400" size={28} aria-hidden="true" /><h3 className="mt-4 font-semibold text-slate-900">No report data available yet</h3><p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-600">Run analysis or data validation, or upload a dataset to enable exports. No sample reports are shown.</p></div></Card>
      )}
      {!datasets.length && <p className="text-sm text-slate-500">Upload a dataset to enable preview exports.</p>}
    </div>
  )
}

export default ReportsPage
