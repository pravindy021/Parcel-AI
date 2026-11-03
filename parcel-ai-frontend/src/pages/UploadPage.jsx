import { AlertCircle, ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '../components/common/Card'
import { useAppContext } from '../context/useAppContext'

const MAX_FILE_SIZE_MB = Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB || 20)
const FALLBACK_ACCEPTED_EXTENSIONS = ['.csv', '.xlsx']

const formatSize = (size) => {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}

export const UploadPage = () => {
  const { backendConfig, uploadFile, loading } = useAppContext()
  const configuredServerLimit = Number(backendConfig?.max_upload_size_mb)
  const maxFileSizeMb = Number.isFinite(configuredServerLimit) && configuredServerLimit > 0
    ? configuredServerLimit
    : MAX_FILE_SIZE_MB
  const acceptedExtensions = Array.isArray(backendConfig?.supported_file_types)
    ? backendConfig.supported_file_types.map((extension) => String(extension).toLowerCase())
    : FALLBACK_ACCEPTED_EXTENSIONS
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const [selectedFile, setSelectedFile] = useState(null)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(null)

  const selectFile = (file) => {
    setSuccess(false)
    setMessage('')
    setProgress(null)
    if (!file) return
    const extension = file.name.split('.').pop()?.toLowerCase()
    if (!acceptedExtensions.includes(`.${extension || ''}`)) {
      setSelectedFile(null)
      setMessage(`Unsupported file type. Select one of: ${acceptedExtensions.join(', ')}.`)
      return
    }
    if (file.size === 0) {
      setSelectedFile(null)
      setMessage('This file is empty. Select a file that contains shipment records.')
      return
    }
    if (file.size > maxFileSizeMb * 1024 * 1024) {
      setSelectedFile(null)
      setMessage(`The file is larger than the configured ${maxFileSizeMb} MB upload limit.`)
      return
    }
    setSelectedFile(file)
  }

  const onFileInputChange = (event) => {
    selectFile(event.target.files?.[0])
    event.target.value = ''
  }

  const onDrop = (event) => {
    event.preventDefault()
    setDragging(false)
    if (loading) return
    selectFile(event.dataTransfer.files?.[0])
  }

  const handleUpload = async () => {
    if (!selectedFile || loading) return
    try {
      setMessage('')
      setProgress(0)
      const dataset = await uploadFile(selectedFile, undefined, (event) => {
        if (event.total) setProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
      })
      if (!dataset?.id) {
        setSuccess(false)
        setProgress(null)
        setMessage('The upload response did not include a dataset ID. Refresh the dataset library before retrying.')
        return
      }
      setSuccess(true)
      setMessage(`Uploaded ${dataset.filename || selectedFile.name} successfully.`)
      navigate(`/datasets/${dataset.id}`, { state: { newlyUploaded: true } })
    } catch (error) {
      setSuccess(false)
      setProgress(null)
      setMessage(error.message || 'The upload failed. Please try again.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-blue-700">Data ingestion</p>
        <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Upload shipment data</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Import a file to validate its columns and explore the data through the connected Parcel-AI backend.</p>
      </div>

      <Card>
        <div
          onDragOver={(event) => { event.preventDefault(); if (!loading) setDragging(true) }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed px-5 py-12 text-center transition ${dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50'}`}
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-blue-700 shadow-sm">
            <UploadCloud size={26} aria-hidden="true" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-900">Drag your file here</h3>
          <p className="mt-2 text-sm text-slate-600">or choose a file from your device</p>
          <button type="button" onClick={() => inputRef.current?.click()} className="mt-5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
            Browse files
          </button>
          <input ref={inputRef} type="file" className="sr-only" accept={acceptedExtensions.join(',')} onChange={onFileInputChange} aria-label="Choose a shipment dataset" disabled={loading} />
          <p className="mt-4 text-xs text-slate-500">{acceptedExtensions.join(', ').toUpperCase()} · Up to {maxFileSizeMb} MB · {backendConfig ? 'Backend upload limit' : 'Local pre-check; backend limit may differ'} · Files are sent to your configured backend</p>
        </div>

        {selectedFile && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700"><FileSpreadsheet size={19} aria-hidden="true" /></span>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{selectedFile.name}</p><p className="mt-1 text-xs text-slate-500">{formatSize(selectedFile.size)}</p></div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={loading} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">Replace</button>
              <button type="button" onClick={() => { setSelectedFile(null); setMessage(''); setProgress(null) }} disabled={loading} aria-label="Remove selected file" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"><X size={16} aria-hidden="true" /></button>
            </div>
          </div>
        )}

        {progress !== null && loading && (
          <div className="mt-4">
            <div className="mb-2 flex justify-between text-xs text-slate-600"><span>Uploading file</span><span>{progress}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="File upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-blue-700 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-xs leading-5 text-slate-500">The server validates the uploaded file too. File contents are not saved in browser storage.</p>
          <button type="button" onClick={handleUpload} disabled={!selectedFile || loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Uploading…</> : <>Upload dataset <ArrowRight size={15} aria-hidden="true" /></>}
          </button>
        </div>

        {message && (
          <div role={success ? 'status' : 'alert'} className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
            {success ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <span>{message}</span>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-900">Accepted file formats</p>
          <p className="mt-2 text-sm text-slate-600">{acceptedExtensions.join(', ').toUpperCase()} supported by the current upload API.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-semibold text-slate-900">Already uploaded a file?</p>
          <Link to="/datasets" className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:text-blue-800">Browse your datasets <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  )
}

export default UploadPage
