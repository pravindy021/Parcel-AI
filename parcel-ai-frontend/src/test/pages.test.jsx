import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useAppContext } from '../context/useAppContext'
import { analyzeDataset, getDataset, getDatasetAnalysis, getDatasetColumns, getDatasetPreview, getDatasetValidation, saveDatasetMapping } from '../services/api'
import AnalyticsPage from '../pages/AnalyticsPage'
import DashboardPage from '../pages/DashboardPage'
import DataPreviewPage from '../pages/DataPreviewPage'
import DataQualityPage from '../pages/DataQualityPage'
import LandingPage from '../pages/LandingPage'
import PredictionsPage from '../pages/PredictionsPage'
import DatasetsPage from '../pages/DatasetsPage'
import SettingsPage from '../pages/SettingsPage'
import Sidebar from '../components/layout/Sidebar'
import UploadPage from '../pages/UploadPage'
import DatasetComparisonPage from '../pages/DatasetComparisonPage'
import { downloadCsv } from '../utils/data'

vi.mock('../context/useAppContext', () => ({ useAppContext: vi.fn() }))
vi.mock('../services/api', () => ({
  API_BASE_URL: 'http://127.0.0.1:8000',
  getDataset: vi.fn(),
  getDatasetAnalysis: vi.fn(),
  getDatasetColumns: vi.fn(),
  getDatasetPreview: vi.fn(),
  getDatasetValidation: vi.fn(),
  analyzeDataset: vi.fn(),
  saveDatasetMapping: vi.fn(),
}))
vi.mock('../utils/data', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, downloadCsv: vi.fn() }
})

const makeContext = (overrides = {}) => ({
  analysis: null,
  analyzeSelectedDataset: vi.fn().mockResolvedValue(null),
  checkHealth: vi.fn().mockResolvedValue({ status: 'healthy' }),
  createModel: vi.fn(),
  createPredictions: vi.fn(),
  datasets: [],
  exportedReports: [],
  fetchModels: vi.fn().mockResolvedValue([]),
  fetchPredictions: vi.fn().mockResolvedValue([]),
  health: { status: 'checking' },
  backendConfig: { max_upload_size_mb: 20, supported_file_types: ['.csv', '.xlsx'] },
  loading: false,
  models: [],
  markReportExported: vi.fn(),
  predictions: [],
  removeDataset: vi.fn(),
  selectedDataset: null,
  selectedDatasetId: '',
  setAnalysis: vi.fn(),
  setSelectedDatasetId: vi.fn(),
  setValidation: vi.fn(),
  uploadFile: vi.fn(),
  validateSelectedDataset: vi.fn(),
  validation: null,
  workspaceReady: true,
  ...overrides,
})

const LocationProbe = () => <p data-testid="location">{useLocation().pathname}</p>

beforeEach(() => {
  useAppContext.mockReturnValue(makeContext())
  getDataset.mockResolvedValue({ data: { id: 'dataset-1', filename: 'shipments.csv', status: 'uploaded' } })
  getDatasetPreview.mockResolvedValue({
    data: {
      columns: ['shipment_id', 'carrier'],
      rows: [{ shipment_id: 'S-100', carrier: 'Carrier A' }],
      total_rows: 1,
      total_columns: 2,
    },
  })
  getDatasetColumns.mockResolvedValue({
    data: {
      columns: ['Tracking Number', 'Courier'],
      suggested_mapping: { shipment_id: 'Tracking Number', carrier: 'Courier' },
      column_mapping: {},
      standard_fields: ['shipment_id', 'carrier'],
    },
  })
  saveDatasetMapping.mockResolvedValue({ data: { column_mapping: {} } })
  getDatasetAnalysis.mockRejectedValue(Object.assign(new Error('Analysis not found'), { status: 404 }))
  getDatasetValidation.mockRejectedValue(Object.assign(new Error('Validation not found'), { status: 404 }))
  analyzeDataset.mockReset()
  downloadCsv.mockReset()
})

describe('Parcel-AI frontend pages', () => {
  it('renders the public landing page and dashboard entry', () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /predict delays/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /explore dashboard/i })).toHaveAttribute('href', '/dashboard')
  })

  it('shows an onboarding state on the dashboard without datasets', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /start with a shipment dataset/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /upload dataset/i })).toHaveAttribute('href', '/upload')
  })

  it('keeps demo mode visibly separate from uploaded dataset data', async () => {
    const context = makeContext({
      datasets: [{ id: 'real-1', filename: 'private-shipments.csv' }],
      selectedDataset: { id: 'real-1', filename: 'private-shipments.csv' },
      selectedDatasetId: 'real-1',
    })
    useAppContext.mockReturnValue(context)
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /demo mode: off/i }))
    expect(await screen.findByText(/demo mode — illustrative sample data/i)).toBeInTheDocument()
    expect(screen.getByText('DEMO-1042')).toBeInTheDocument()
    expect(screen.queryByText('private-shipments.csv')).not.toBeInTheDocument()
    expect(screen.getByText(/no simulated ml predictions/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /demo mode: on/i }))
    expect((await screen.findAllByText('private-shipments.csv')).length).toBeGreaterThan(0)
  })

  it('exposes working sidebar navigation destinations', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /analytics/i })).toHaveAttribute('href', '/analytics')
    expect(screen.getByRole('link', { name: /delay predictions/i })).toHaveAttribute('href', '/predictions')
  })

  it('rejects unsupported upload file types before calling the backend', () => {
    const context = makeContext()
    useAppContext.mockReturnValue(context)
    render(<MemoryRouter><UploadPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/choose a shipment dataset/i), {
      target: { files: [new File(['no'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/unsupported file type/i)
    expect(context.uploadFile).not.toHaveBeenCalled()
  })

  it('uses the backend upload limit and supported formats', () => {
    const context = makeContext({ backendConfig: { max_upload_size_mb: 1, supported_file_types: ['.csv', '.xlsx'] } })
    useAppContext.mockReturnValue(context)
    render(<MemoryRouter><UploadPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/choose a shipment dataset/i), {
      target: { files: [new File(['a'.repeat(1024 * 1024 + 1)], 'large.csv', { type: 'text/csv' })] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/configured 1 mb upload limit/i)
    fireEvent.change(screen.getByLabelText(/choose a shipment dataset/i), {
      target: { files: [new File(['legacy'], 'legacy.xls', { type: 'application/vnd.ms-excel' })] },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(/select one of: \.csv, \.xlsx/i)
    expect(context.uploadFile).not.toHaveBeenCalled()
  })

  it('uploads supported files and navigates to the returned dataset', async () => {
    const context = makeContext({ uploadFile: vi.fn().mockResolvedValue({ id: 'dataset-1', filename: 'shipments.csv' }) })
    useAppContext.mockReturnValue(context)
    render(
      <MemoryRouter initialEntries={['/upload']}>
        <Routes>
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/datasets/:datasetId" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.change(screen.getByLabelText(/choose a shipment dataset/i), {
      target: { files: [new File(['shipment_id\nS-1'], 'shipments.csv', { type: 'text/csv' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: /upload dataset/i }))
    await waitFor(() => expect(context.uploadFile).toHaveBeenCalledOnce())
    expect(await screen.findByTestId('location')).toHaveTextContent('/datasets/dataset-1')
    expect(context.uploadFile.mock.calls[0][0].name).toBe('shipments.csv')
  })

  it('shows backend upload failures instead of reporting success', async () => {
    const context = makeContext({ uploadFile: vi.fn().mockRejectedValue(new Error('Upload rejected by server')) })
    useAppContext.mockReturnValue(context)
    render(<MemoryRouter><UploadPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/choose a shipment dataset/i), {
      target: { files: [new File(['shipment_id\nS-1'], 'shipments.csv', { type: 'text/csv' })] },
    })
    fireEvent.click(screen.getByRole('button', { name: /upload dataset/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload rejected by server')
  })

  it('saves suggested column mappings for consistent dataset processing', async () => {
    render(
      <MemoryRouter initialEntries={['/datasets/dataset-1']}>
        <Routes><Route path="/datasets/:datasetId" element={<DataPreviewPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByLabelText('shipment id')).toHaveValue('Tracking Number')
    expect(screen.getByLabelText('carrier')).toHaveValue('Courier')
    fireEvent.click(screen.getByRole('button', { name: /save column mapping/i }))
    await waitFor(() => expect(saveDatasetMapping).toHaveBeenCalledWith('dataset-1', {
      shipment_id: 'Tracking Number',
      carrier: 'Courier',
    }))
    expect(await screen.findByText(/mapping saved and applied/i)).toBeInTheDocument()
  })

  it('renders rows returned from the dataset preview API', async () => {
    render(
      <MemoryRouter initialEntries={['/datasets/dataset-1']}>
        <Routes><Route path="/datasets/:datasetId" element={<DataPreviewPage />} /></Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByText('S-100')).toBeInTheDocument()
    expect(screen.getByText('Carrier A')).toBeInTheDocument()
    expect(getDatasetPreview).toHaveBeenCalledWith('dataset-1', 50)
  })

  it('sorts the returned preview records without fetching the full dataset', async () => {
    getDatasetPreview.mockResolvedValue({ data: {
      columns: ['shipment_id', 'carrier'],
      rows: [{ shipment_id: 'S-2', carrier: 'Zulu' }, { shipment_id: 'S-1', carrier: 'Alpha' }],
      total_rows: 2,
      total_columns: 2,
    } })
    render(
      <MemoryRouter initialEntries={['/datasets/dataset-1']}>
        <Routes><Route path="/datasets/:datasetId" element={<DataPreviewPage />} /></Routes>
      </MemoryRouter>,
    )
    await screen.findByText('S-2')
    fireEvent.click(screen.getByRole('button', { name: 'carrier ↕' }))
    const bodyRows = screen.getAllByRole('row').slice(1)
    expect(bodyRows[0]).toHaveTextContent('Alpha')
    expect(getDatasetPreview).toHaveBeenCalledWith('dataset-1', 50)
  })

  it('sorts and paginates large dataset libraries', () => {
    const datasets = Array.from({ length: 12 }, (_, index) => ({
      id: `dataset-${index}`,
      filename: `shipment-${String(12 - index).padStart(2, '0')}.csv`,
      file_type: '.csv',
      size_bytes: 100,
      created_at: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00`,
    }))
    useAppContext.mockReturnValue(makeContext({ datasets, workspaceReady: true }))
    render(<MemoryRouter><DatasetsPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/sort datasets/i), { target: { value: 'name' } })
    expect(screen.getByText('shipment-01.csv')).toBeInTheDocument()
    expect(screen.queryByText('shipment-12.csv')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /next/i }))
    expect(screen.getByText('shipment-12.csv')).toBeInTheDocument()
  })

  it('shows a useful empty state when data quality has no dataset', () => {
    render(<MemoryRouter><DataQualityPage /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: /no dataset to validate/i })).toBeInTheDocument()
  })

  it('does not invent analytics when backend analysis is missing', async () => {
    useAppContext.mockReturnValue(makeContext({
      datasets: [{ id: 'dataset-1', filename: 'shipments.csv' }],
      selectedDataset: { id: 'dataset-1', filename: 'shipments.csv' },
      selectedDatasetId: 'dataset-1',
    }))
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /no analysis available/i })).toBeInTheDocument()
    expect(screen.queryByText('8,420')).not.toBeInTheDocument()
  })

  it('shows an honest unavailable state when no trained model exists', async () => {
    useAppContext.mockReturnValue(makeContext({
      datasets: [{ id: 'dataset-1', filename: 'shipments.csv' }],
      selectedDatasetId: 'dataset-1',
    }))
    render(<MemoryRouter><PredictionsPage /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /no trained model available/i })).toBeInTheDocument()
    expect(screen.getByText(/no predictions for this dataset yet/i)).toBeInTheDocument()
    expect(screen.queryByText('1,248')).not.toBeInTheDocument()
  })

  it('does not associate predictions without a dataset ID with the selected dataset', async () => {
    useAppContext.mockReturnValue(makeContext({
      datasets: [{ id: 'dataset-1', filename: 'shipments.csv' }],
      selectedDatasetId: 'dataset-1',
      predictions: [{
        id: 'unlinked',
        shipment_id: 'UNLINKED',
        probability: 0.9,
        risk_level: 'high',
      }],
    }))
    render(<MemoryRouter><PredictionsPage /></MemoryRouter>)
    expect(await screen.findByText(/no predictions for this dataset yet/i)).toBeInTheDocument()
    expect(screen.queryByText('UNLINKED')).not.toBeInTheDocument()
  })

  it('only shows prediction explanations and feature importance returned by the model', async () => {
    useAppContext.mockReturnValue(makeContext({
      datasets: [{ id: 'dataset-1', filename: 'shipments.csv' }],
      selectedDataset: { id: 'dataset-1', filename: 'shipments.csv' },
      selectedDatasetId: 'dataset-1',
      models: [{
        id: 'model-1',
        name: 'delay-model',
        model_type: 'random_forest',
        version: 'v1',
        feature_importance: { distance_km: 0.42 },
      }],
      predictions: [{
        id: 'prediction-1',
        dataset_id: 'dataset-1',
        shipment_id: 'S-99',
        model_id: 'model-1',
        probability: 0.72,
        risk_level: 'medium',
        prediction: { explanation: 'Distance was highlighted by the model.' },
      }],
    }))
    render(<MemoryRouter><PredictionsPage /></MemoryRouter>)
    expect(await screen.findByText('distance_km')).toBeInTheDocument()
    expect(screen.getByText('Distance was highlighted by the model.')).toBeInTheDocument()
    expect(screen.getByText(/do not prove causality/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/filter prediction results/i), { target: { value: 'S-99' } })
    fireEvent.click(screen.getByRole('button', { name: /export filtered predictions csv/i }))
    expect(downloadCsv).toHaveBeenCalledOnce()
    expect(downloadCsv.mock.calls[0][1][0]).toMatchObject({
      dataset_name: 'shipments.csv',
      shipment_id: 'S-99',
      filters: 'Search: S-99',
    })
  })

  it('compares two uploaded datasets only with backend-provided analysis', async () => {
    useAppContext.mockReturnValue(makeContext({
      datasets: [
        { id: 'dataset-1', filename: 'week-one.csv' },
        { id: 'dataset-2', filename: 'week-two.csv' },
      ],
      selectedDatasetId: 'dataset-1',
    }))
    getDatasetPreview.mockImplementation((id) => Promise.resolve({ data: {
      columns: ['shipment_id', 'carrier'],
      rows: [],
      total_rows: id === 'dataset-1' ? 10 : 20,
      total_columns: 2,
    } }))
    analyzeDataset.mockImplementation((id) => Promise.resolve({ data: {
      dataset_id: id,
      summary: {
        total_shipments: id === 'dataset-1' ? 10 : 20,
        late_shipments: id === 'dataset-1' ? 2 : 3,
        delay_rate: id === 'dataset-1' ? 20 : 15,
        on_time_delivery_percentage: id === 'dataset-1' ? 80 : 85,
      },
      chart_ready: { carrier_performance: [{ carrier: 'Carrier A', shipments: id === 'dataset-1' ? 10 : 20 }] },
    } }))
    render(<MemoryRouter><DatasetComparisonPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }))
    expect(await screen.findByText('20.0%')).toBeInTheDocument()
    expect(screen.getByText('15.0%')).toBeInTheDocument()
    expect(screen.getByText(/carrier shipment counts, not carrier-specific delay rates/i)).toBeInTheDocument()
    expect(analyzeDataset).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: /export comparison csv/i }))
    expect(downloadCsv).toHaveBeenCalledOnce()
    expect(downloadCsv.mock.calls[0][1][0]).toHaveProperty('first_dataset', 'week-one.csv')
  })

  it('reports incompatible comparison columns instead of inventing missing metrics', async () => {
    useAppContext.mockReturnValue(makeContext({
      datasets: [
        { id: 'dataset-1', filename: 'first.csv' },
        { id: 'dataset-2', filename: 'second.csv' },
      ],
      selectedDatasetId: 'dataset-1',
    }))
    getDatasetPreview.mockImplementation((id) => Promise.resolve({ data: {
      columns: [id === 'dataset-1' ? 'route_code' : 'area_name'],
      rows: [],
      total_rows: 5,
      total_columns: 1,
    } }))
    analyzeDataset.mockImplementation((id) => Promise.resolve({ data: {
      dataset_id: id,
      summary: { total_shipments: 5 },
      chart_ready: {},
    } }))
    render(<MemoryRouter><DatasetComparisonPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }))
    expect(await screen.findByText(/no columns are shared/i)).toBeInTheDocument()
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/carrier comparison is unavailable/i)).toBeInTheDocument()
  })

  it('exports analytics metrics with selected dataset and filter metadata', async () => {
    const context = makeContext({
      analysis: {
        dataset_id: 'dataset-1',
        summary: { total_shipments: 10, late_shipments: 2, on_time_delivery_percentage: 80 },
        chart_ready: { daily_trends: [{ date: '2026-10-01', shipments: 10 }] },
      },
      datasets: [{ id: 'dataset-1', filename: 'shipments.csv' }],
      selectedDataset: { id: 'dataset-1', filename: 'shipments.csv' },
      selectedDatasetId: 'dataset-1',
    })
    useAppContext.mockReturnValue(context)
    render(<MemoryRouter><AnalyticsPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /export filtered analytics csv/i }))
    expect(downloadCsv).toHaveBeenCalledOnce()
    expect(downloadCsv.mock.calls[0][1][0]).toMatchObject({
      dataset_name: 'shipments.csv',
      metric: 'Total shipments',
      value: 10,
    })
    expect(context.markReportExported).toHaveBeenCalledWith('dataset-1', 'analytics-summary')
  })

  it('shows the disconnected backend state in settings', () => {
    useAppContext.mockReturnValue(makeContext({ health: { status: 'disconnected' } }))
    render(<MemoryRouter><SettingsPage /></MemoryRouter>)
    expect(screen.getByText('Disconnected')).toBeInTheDocument()
    expect(screen.getByText(/confirm that the api is running/i)).toBeInTheDocument()
  })
})
