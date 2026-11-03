import { ArrowRight, CheckCircle2, CircleDashed, CircleSlash } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppContext } from '../../context/useAppContext'

const StatusIcon = ({ state }) => {
  if (state === 'completed') return <CheckCircle2 size={17} className="text-emerald-600" aria-hidden="true" />
  if (state === 'unavailable') return <CircleSlash size={17} className="text-slate-400" aria-hidden="true" />
  return <CircleDashed size={17} className="text-amber-600" aria-hidden="true" />
}

export const WorkflowProgress = () => {
  const { analysis, datasets, exportedReports, predictions, selectedDataset, selectedDatasetId, validation } = useAppContext()
  const hasDataset = Boolean(selectedDatasetId && selectedDataset)
  const hasAnalysis = analysis?.dataset_id === selectedDatasetId
  const hasValidation = validation?.dataset_id === selectedDatasetId
  const hasPredictions = predictions.some((item) => item.dataset_id === selectedDatasetId)
  const hasExport = (exportedReports || []).some((item) => item.datasetId === selectedDatasetId)

  const stages = [
    { title: 'Upload data', to: '/upload', state: datasets.length ? 'completed' : 'pending', detail: datasets.length ? `${datasets.length} dataset${datasets.length === 1 ? '' : 's'} available` : 'Choose a shipment file' },
    { title: 'Validate', to: '/data-quality', state: !hasDataset ? 'unavailable' : hasValidation ? 'completed' : 'pending', detail: !hasDataset ? 'Upload a dataset first' : hasValidation ? `Latest result: ${validation.status}` : 'Run dataset quality checks' },
    { title: 'Analyze', to: '/analytics', state: !hasDataset ? 'unavailable' : hasAnalysis ? 'completed' : 'pending', detail: !hasDataset ? 'Upload a dataset first' : hasAnalysis ? 'Backend analysis available' : 'Generate dataset aggregates' },
    { title: 'Predict', to: '/predictions', state: !hasDataset ? 'unavailable' : hasPredictions ? 'completed' : 'pending', detail: !hasDataset ? 'Upload a dataset first' : hasPredictions ? 'Backend predictions available' : 'Requires a trained model' },
    { title: 'Export report', to: '/reports', state: !hasDataset ? 'unavailable' : hasExport ? 'completed' : 'pending', detail: !hasDataset ? 'Upload a dataset first' : hasExport ? 'An export was generated this session' : 'Export available dataset results' },
  ]

  return (
    <section aria-labelledby="workflow-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">End-to-end workflow</p>
          <h2 id="workflow-title" className="mt-1 text-lg font-semibold text-slate-900">Shipment data to operational insight</h2>
        </div>
        <p className="text-xs text-slate-500">Progress reflects the selected uploaded dataset.</p>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {stages.map((stage, index) => (
          <li key={stage.title}>
            <Link to={stage.to} className="block h-full rounded-xl border border-slate-100 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-blue-50/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800"><StatusIcon state={stage.state} />{index + 1}. {stage.title}</span>
                <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
              </span>
              <span className="mt-2 block text-xs capitalize text-slate-500">{stage.state} · {stage.detail}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default WorkflowProgress
