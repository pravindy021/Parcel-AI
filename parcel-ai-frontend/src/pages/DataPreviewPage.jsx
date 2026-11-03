import { AlertCircle, ArrowLeft, CheckCircle2, Download, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Card } from '../components/common/Card'
import StatusBadge from '../components/common/StatusBadge'
import { useAppContext } from '../context/useAppContext'
import { getDataset, getDatasetColumns, getDatasetPreview, saveDatasetMapping } from '../services/api'
import { downloadCsv, formatDateTime } from '../utils/data'

const PAGE_SIZE = 10
const printable = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}
const compareValues = (first, second) => {
  if (typeof first === 'number' && typeof second === 'number') return first - second
  return printable(first).localeCompare(printable(second), undefined, { numeric: true, sensitivity: 'base' })
}
const formatPreviewValue = (column, value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value)
  if (typeof value === 'string' && /(?:date|_at|time)$/i.test(column) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
    return formatDateTime(value, dateOnly ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'medium', timeStyle: 'short' })
  }
  return printable(value)
}

export const DataPreviewPage = () => {
  const { datasetId } = useParams()
  const { markReportExported } = useAppContext()
  const [requestVersion, setRequestVersion] = useState(0)
  const [requestState, setRequestState] = useState({ datasetId: '', version: -1, dataset: null, preview: null, error: '' })
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState({ column: '', direction: 'asc' })
  const [columnMapping, setColumnMapping] = useState({})
  const [mappingStatus, setMappingStatus] = useState({ saving: false, message: '', error: false })

  useEffect(() => {
    let active = true
    Promise.all([getDataset(datasetId), getDatasetPreview(datasetId, 50), getDatasetColumns(datasetId)])
      .then(([datasetResponse, previewResponse, columnsResponse]) => {
        if (active) {
          const columnsData = columnsResponse.data
          setRequestState({
            datasetId,
            version: requestVersion,
            dataset: datasetResponse.data,
            preview: previewResponse.data,
            sourceColumns: columnsData.columns,
            mappingOptions: columnsData.standard_fields,
            error: '',
          })
          setColumnMapping(
            Object.keys(columnsData.column_mapping || {}).length
              ? columnsData.column_mapping
              : columnsData.suggested_mapping || {},
          )
        }
      })
      .catch((requestError) => {
        if (active) setRequestState({ datasetId, version: requestVersion, dataset: null, preview: null, sourceColumns: [], mappingOptions: [], error: requestError.message })
      })
    return () => { active = false }
  }, [datasetId, requestVersion])

  const responseIsCurrent = requestState.datasetId === datasetId && requestState.version === requestVersion
  const loading = !responseIsCurrent
  const error = responseIsCurrent ? requestState.error : ''
  const dataset = responseIsCurrent ? requestState.dataset : null
  const preview = responseIsCurrent ? requestState.preview : null

  const rows = useMemo(() => {
    const data = Array.isArray(preview?.rows) ? preview.rows : []
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return data
    return data.filter((row) =>
      (preview?.columns || []).some((column) => printable(row[column]).toLowerCase().includes(normalizedQuery)),
    )
  }, [preview, query])
  const sortedRows = useMemo(() => {
    if (!sort.column) return rows
    const direction = sort.direction === 'asc' ? 1 : -1
    return [...rows].sort((first, second) => direction * compareValues(first[sort.column], second[sort.column]))
  }, [rows, sort])
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = sortedRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const mappingOptions = responseIsCurrent ? requestState.mappingOptions || [] : []
  const sourceColumns = responseIsCurrent ? requestState.sourceColumns || [] : []

  const submitColumnMapping = async (event) => {
    event.preventDefault()
    setMappingStatus({ saving: true, message: '', error: false })
    try {
      await saveDatasetMapping(datasetId, columnMapping)
      setMappingStatus({ saving: false, message: 'Column mapping saved and applied to dataset processing.', error: false })
      setRequestVersion((current) => current + 1)
    } catch (mappingError) {
      setMappingStatus({ saving: false, message: mappingError.message, error: true })
    }
  }

  const exportRows = () => {
    try {
      const generatedAt = new Date().toISOString()
      const exportRowsWithMetadata = rows.map((row) => ({
        ...row,
        dataset_name: dataset?.filename || datasetId,
        filters: query.trim() ? `Search: ${query.trim()}` : 'None',
        report_generated_at: generatedAt,
      }))
      downloadCsv('parcel-ai-dataset-preview.csv', exportRowsWithMetadata, [
        ...(preview?.columns || []),
        'dataset_name',
        'filters',
        'report_generated_at',
      ])
      markReportExported(datasetId, 'dataset-preview')
    } catch (exportError) {
      setRequestState((current) => ({ ...current, error: exportError.message }))
    }
  }

  if (loading) {
    return <Card title="Dataset preview"><p className="py-10 text-center text-sm text-slate-500" role="status">Loading dataset preview…</p></Card>
  }
  if (error && !preview) {
    return (
      <Card title="Unable to load dataset">
        <div role="alert" className="flex items-start gap-2 text-sm text-rose-700"><AlertCircle size={17} className="mt-0.5" aria-hidden="true" />{error}</div>
        <button type="button" onClick={() => setRequestVersion((current) => current + 1)} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50">Try again</button>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Link to="/datasets" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950"><ArrowLeft size={15} aria-hidden="true" /> Back to datasets</Link>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-blue-700">Dataset preview</p>
          <h2 className="mt-1 break-all text-2xl font-bold tracking-tight text-slate-950">{dataset?.filename || 'Uploaded dataset'}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <StatusBadge status={dataset?.status || 'uploaded'} />
            <span>{preview?.total_rows ?? '—'} records</span><span aria-hidden="true">·</span><span>{preview?.total_columns ?? '—'} columns</span>
            {dataset?.created_at && <><span aria-hidden="true">·</span><span>Uploaded {formatDateTime(dataset.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</span></>}
          </div>
        </div>
        <button type="button" onClick={exportRows} disabled={!rows.length} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Download size={16} aria-hidden="true" /> Export filtered preview rows
        </button>
      </div>

      <Card title="Map source columns">
        <p className="mb-4 text-sm leading-6 text-slate-600">
          Suggested matches are based on column names. Confirm or change them before validation and analytics; unmapped fields remain available under their original names.
        </p>
        <form onSubmit={submitColumnMapping}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mappingOptions.map((field) => (
              <label key={field} className="min-w-0 text-sm font-medium text-slate-700">
                <span className="mb-1.5 block">{field.replaceAll('_', ' ')}</span>
                <select
                  value={columnMapping[field] || ''}
                  onChange={(event) => {
                    setColumnMapping((current) => {
                      const next = { ...current }
                      if (event.target.value) next[field] = event.target.value
                      else delete next[field]
                      return next
                    })
                    setMappingStatus({ saving: false, message: '', error: false })
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Not mapped</option>
                  {sourceColumns.map((column) => (
                    <option
                      key={column}
                      value={column}
                      disabled={Object.entries(columnMapping).some(([mappedField, source]) => mappedField !== field && source === column)}
                    >
                      {column}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{Object.keys(columnMapping).length} of {mappingOptions.length} fields mapped</p>
            <button type="submit" disabled={mappingStatus.saving} className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
              {mappingStatus.saving ? 'Saving mapping…' : 'Save column mapping'}
            </button>
          </div>
          {mappingStatus.message && (
            <p role={mappingStatus.error ? 'alert' : 'status'} className={`mt-4 flex items-center gap-2 text-sm ${mappingStatus.error ? 'text-rose-700' : 'text-emerald-700'}`}>
              {!mappingStatus.error && <CheckCircle2 size={16} aria-hidden="true" />}
              {mappingStatus.message}
            </p>
          )}
        </form>
      </Card>

      <Card title="Column overview">
        <div className="flex flex-wrap gap-2">
          {(preview?.columns || []).map((column) => <span key={column} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">{column}</span>)}
          {!preview?.columns?.length && <p className="text-sm text-slate-500">The backend did not return any columns for this dataset.</p>}
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">The preview API returns up to 50 records. Full-file pagination and per-column profiling are not provided by the current backend endpoint.</p>
      </Card>

      <Card title="Records">
        {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <label className="relative mb-4 block max-w-sm">
          <span className="sr-only">Search preview records</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search in returned records" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        {pageRows.length && preview?.columns?.length ? (
          <>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>{preview.columns.map((column) => {
                  const direction = sort.column === column ? sort.direction : ''
                  return <th key={column} aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'} className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => { setSort({ column, direction: direction === 'asc' ? 'desc' : 'asc' }); setPage(1) }} className="min-h-8 rounded px-1 text-left hover:text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">{column}{direction ? (direction === 'asc' ? ' ↑' : ' ↓') : ' ↕'}</button></th>
                })}</tr></thead>
                <tbody>{pageRows.map((row, index) => <tr key={`${row.shipment_id || index}`} className="border-t border-slate-100">{preview.columns.map((column) => <td key={`${column}-${index}`} className="max-w-72 whitespace-nowrap px-4 py-3 text-slate-700">{formatPreviewValue(column, row[column])}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span>{rows.length} matching preview row{rows.length === 1 ? '' : 's'}{preview.total_rows > preview.rows.length ? ` · showing a sample of ${preview.total_rows} total records` : ''}</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
                <span>Page {currentPage} of {pageCount}</span>
                <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
              </div>
            </div>
          </>
        ) : (
          <div className="py-10 text-center text-sm text-slate-500">{preview?.rows?.length ? 'No preview rows match your search.' : 'No records were returned.'}</div>
        )}
      </Card>
    </div>
  )
}

export default DataPreviewPage
