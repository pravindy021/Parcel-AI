import { Database, FileSpreadsheet, Loader2, Search, Trash2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../components/common/Card'
import StatusBadge from '../components/common/StatusBadge'
import { useAppContext } from '../context/useAppContext'
import { formatDateTime } from '../utils/data'

const formatSize = (size) => {
  if (!Number.isFinite(size)) return 'Size unavailable'
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}
const PAGE_SIZE = 10

export const DatasetsPage = () => {
  const { datasets, loading, removeDataset, selectedDatasetId, setSelectedDatasetId, workspaceReady } = useAppContext()
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState('newest')
  const [page, setPage] = useState(1)
  const [actionError, setActionError] = useState('')
  const filteredDatasets = useMemo(() => {
    const search = query.trim().toLowerCase()
    const filtered = datasets.filter((dataset) =>
      [dataset.filename, dataset.file_type].some((value) => String(value || '').toLowerCase().includes(search)),
    )
    return filtered.sort((first, second) => {
      if (sortBy === 'name') return String(first.filename || '').localeCompare(String(second.filename || ''), undefined, { numeric: true, sensitivity: 'base' })
      if (sortBy === 'largest') return (second.size_bytes || 0) - (first.size_bytes || 0)
      return Date.parse(second.created_at || '') - Date.parse(first.created_at || '')
    })
  }, [datasets, query, sortBy])
  const pageCount = Math.max(1, Math.ceil(filteredDatasets.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleDatasets = filteredDatasets.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  if (!workspaceReady && !datasets.length) {
    return <Card><div role="status" aria-busy="true" className="space-y-3 py-5"><p className="text-sm font-medium text-slate-600">Loading dataset library…</p><div className="h-14 animate-pulse rounded-xl bg-slate-100" /><div className="h-14 animate-pulse rounded-xl bg-slate-100" /><div className="h-14 animate-pulse rounded-xl bg-slate-100" /></div></Card>
  }

  const handleDelete = async (dataset) => {
    if (!window.confirm(`Delete "${dataset.filename}"? This also removes the stored file from the backend.`)) return
    setActionError('')
    try {
      await removeDataset(dataset.id)
    } catch (error) {
      setActionError(error.message)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold text-blue-700">Data library</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">My datasets</h2>
          <p className="mt-2 text-sm text-slate-600">{datasets.length} dataset{datasets.length === 1 ? '' : 's'} returned by the backend</p>
        </div>
        <Link to="/upload" className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
          <Upload size={16} aria-hidden="true" /> Upload dataset
        </Link>
      </div>

      <Card>
        {actionError && <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{actionError}</p>}
        <label className="relative block max-w-sm">
          <span className="sr-only">Search datasets</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search by filename or file type" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
        </label>
        <label className="mt-3 block max-w-sm text-xs font-medium text-slate-600">
          <span className="mb-1 block">Sort datasets</span>
          <select value={sortBy} onChange={(event) => { setSortBy(event.target.value); setPage(1) }} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100">
            <option value="newest">Newest first</option>
            <option value="name">Filename A–Z</option>
            <option value="largest">Largest file</option>
          </select>
        </label>

        {filteredDatasets.length ? (
          <>
          <div className="mt-5 overflow-hidden rounded-xl border border-slate-200">
            <div className="divide-y divide-slate-100">
              {visibleDatasets.map((dataset) => (
                <article key={dataset.id} className={`flex flex-col justify-between gap-4 p-4 sm:flex-row sm:items-center ${selectedDatasetId === dataset.id ? 'bg-blue-50/40' : 'bg-white'}`}>
                  <button type="button" onClick={() => setSelectedDatasetId(dataset.id)} className="flex min-w-0 items-center gap-3 text-left">
                    <span className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><FileSpreadsheet size={19} aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{dataset.filename || 'Untitled dataset'}</span>
                      <span className="mt-1 block text-xs text-slate-500">{(dataset.file_type || '').replace('.', '').toUpperCase()} · {formatSize(dataset.size_bytes)}{dataset.created_at ? ` · ${formatDateTime(dataset.created_at, { dateStyle: 'medium' })}` : ''}</span>
                    </span>
                  </button>
                  <div className="flex items-center gap-2 pl-12 sm:pl-0">
                    <StatusBadge status={dataset.status || 'uploaded'} />
                    <Link to={`/datasets/${dataset.id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300">Preview</Link>
                    <button type="button" onClick={() => handleDelete(dataset)} disabled={loading} aria-label={`Delete ${dataset.filename}`} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:border-rose-200 hover:text-rose-700 disabled:opacity-50">
                      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
          {pageCount > 1 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span>{filteredDatasets.length} datasets · Page {currentPage} of {pageCount}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Previous</button>
              <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} className="min-h-11 rounded-lg border border-slate-200 px-3 py-2 disabled:opacity-40">Next</button>
            </div>
          </div>}
          </>
        ) : query ? (
          <div className="py-12 text-center"><Search size={24} className="mx-auto text-slate-400" aria-hidden="true" /><p className="mt-3 text-sm font-medium text-slate-700">No dataset matches “{query}”</p></div>
        ) : (
          <div className="py-14 text-center">
            <Database className="mx-auto text-slate-400" size={30} aria-hidden="true" />
            <h3 className="mt-4 font-semibold text-slate-900">No datasets yet</h3>
            <p className="mt-2 text-sm text-slate-600">Upload a shipment file to begin validation and analytics.</p>
            <Link to="/upload" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white">Upload a file <Upload size={15} aria-hidden="true" /></Link>
          </div>
        )}
      </Card>
    </div>
  )
}

export default DatasetsPage
