import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppContext } from './contextInstance'
import { useAuth } from './AuthContext'
import {
  analyzeDataset,
  deleteDataset,
  getBackendConfig,
  getDatasets,
  getHealth,
  getModels,
  getPredictions,
  predictShipment,
  trainModel,
  uploadDataset,
  validateDataset,
} from '../services/api'

export const AppProvider = ({ children }) => {
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [health, setHealth] = useState({ status: 'checking' })
  const [backendConfig, setBackendConfig] = useState(null)
  const [datasets, setDatasets] = useState([])
  const [selectedDatasetId, setSelectedDatasetId] = useState('')
  const [validation, setValidation] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [models, setModels] = useState([])
  const [predictions, setPredictions] = useState([])
  const [exportedReports, setExportedReports] = useState([])
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)
  const [workspaceReady, setWorkspaceReady] = useState(false)

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => dataset.id === selectedDatasetId) || null,
    [datasets, selectedDatasetId],
  )

  const checkHealth = useCallback(async () => {
    try {
      const { data } = await getHealth()
      setHealth({ ...data, status: 'connected' })
      return data
    } catch (error) {
      setHealth({ status: 'disconnected', message: error.message })
      throw error
    }
  }, [])

  const fetchDatasets = useCallback(async () => {
    try {
      const { data } = await getDatasets()
      const items = Array.isArray(data?.items) ? data.items : []
      setDatasets(items)
      setSelectedDatasetId((current) =>
        items.some((dataset) => dataset.id === current) ? current : items[0]?.id || '',
      )
      return items
    } catch (error) {
      setApiError(error.message)
      throw error
    }
  }, [])

  const refreshWorkspace = useCallback(async () => {
    const results = await Promise.allSettled([
      checkHealth(),
      fetchDatasets(),
      getBackendConfig().then(({ data }) => {
        setBackendConfig(data)
        return data
      }),
    ])
    const failed = results.find((result) => result.status === 'rejected')
    setApiError(failed ? failed.reason.message : '')
    setWorkspaceReady(true)
    if (failed) throw failed.reason
    return results
  }, [checkHealth, fetchDatasets])

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      setDatasets([])
      setSelectedDatasetId('')
      setValidation(null)
      setAnalysis(null)
      setModels([])
      setPredictions([])
      setApiError('')
      setWorkspaceReady(true)
      void Promise.allSettled([
        checkHealth(),
        getBackendConfig().then(({ data }) => setBackendConfig(data)),
      ])
      return
    }
    setWorkspaceReady(false)
    void Promise.resolve().then(refreshWorkspace).catch(() => {})
  }, [authLoading, isAuthenticated, refreshWorkspace, checkHealth])

  const uploadFile = async (file, category = 'historical_shipment_records', onUploadProgress) => {
    setLoading(true)
    setApiError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', category)
      const { data } = await uploadDataset(formData, onUploadProgress)
      await fetchDatasets()
      if (data?.id) setSelectedDatasetId(data.id)
      return data
    } catch (error) {
      setApiError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const removeDataset = async (datasetId) => {
    setLoading(true)
    try {
      await deleteDataset(datasetId)
      await fetchDatasets()
      return true
    } catch (error) {
      setApiError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const validateSelectedDataset = async (datasetId = selectedDatasetId) => {
    if (!datasetId) throw new Error('Select a dataset before running validation.')
    setLoading(true)
    try {
      const { data } = await validateDataset(datasetId)
      setValidation(data)
      setApiError('')
      return data
    } catch (error) {
      setApiError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const analyzeSelectedDataset = async (datasetId = selectedDatasetId) => {
    if (!datasetId) throw new Error('Select a dataset before running analysis.')
    setLoading(true)
    try {
      const { data } = await analyzeDataset(datasetId)
      setAnalysis(data)
      setApiError('')
      return data
    } catch (error) {
      setApiError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const fetchModels = useCallback(async () => {
    try {
      const { data } = await getModels()
      const items = Array.isArray(data?.items) ? data.items : []
      setModels(items)
      return items
    } catch (error) {
      setApiError(error.message)
      throw error
    }
  }, [])

  const createModel = async (datasetId) => {
    if (!datasetId) throw new Error('Select a dataset before training a model.')
    setLoading(true)
    try {
      const { data } = await trainModel({ dataset_id: datasetId })
      setModels((current) => [data, ...current.filter((model) => model.id !== data.id)])
      setApiError('')
      return data
    } catch (error) {
      setApiError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const fetchPredictions = useCallback(async () => {
    try {
      const { data } = await getPredictions()
      const items = Array.isArray(data?.items) ? data.items : []
      setPredictions(items)
      return items
    } catch (error) {
      setApiError(error.message)
      throw error
    }
  }, [])

  const createPredictions = async (modelId, datasetId = selectedDatasetId) => {
    if (!modelId || !datasetId) {
      throw new Error('Select both a trained model and a dataset to generate predictions.')
    }
    setLoading(true)
    try {
      const { data } = await predictShipment({ model_id: modelId, dataset_id: datasetId })
      const items = Array.isArray(data?.items) ? data.items : []
      setPredictions((current) => [...items, ...current])
      setApiError('')
      return items
    } catch (error) {
      setApiError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const markReportExported = (datasetId, reportType) => {
    if (!datasetId || !reportType) return
    setExportedReports((current) => [
      { datasetId, reportType, exportedAt: new Date().toISOString() },
      ...current.filter((item) => item.datasetId !== datasetId || item.reportType !== reportType),
    ])
  }

  const value = {
    health,
    backendConfig,
    datasets,
    selectedDataset,
    selectedDatasetId,
    setSelectedDatasetId,
    validation,
    setValidation,
    analysis,
    setAnalysis,
    models,
    predictions,
    exportedReports,
    markReportExported,
    apiError,
    setApiError,
    workspaceReady,
    loading,
    setLoading,
    checkHealth,
    fetchDatasets,
    refreshWorkspace,
    uploadFile,
    removeDataset,
    validateSelectedDataset,
    analyzeSelectedDataset,
    createModel,
    fetchModels,
    fetchPredictions,
    createPredictions,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
