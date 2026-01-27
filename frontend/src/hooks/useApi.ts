import { useStore } from './useStore';
import type { Scan, ChatMessage, FolderScanResult, Annotation, ModelInfo } from '../types';

const API_BASE = '/api';

export function useApi() {
  const { token, setScan, setFolderScan, setIsLoading, setError, addAnnotations, setModelInfo } = useStore();

  const fetchModelInfo = async (): Promise<ModelInfo | null> => {
    try {
      const response = await fetch(`${API_BASE}/model-info`);
      if (response.ok) {
        const info: ModelInfo = await response.json();
        setModelInfo(info);
        return info;
      }
    } catch {
      // Silently fail - model info is not critical
    }
    return null;
  };

  const scanFolder = async (path: string): Promise<FolderScanResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/scan-folder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to scan folder');
      }

      const data: FolderScanResult = await response.json();
      setFolderScan(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const loadSeries = async (folderId: string, seriesUid?: string): Promise<Scan | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const url = seriesUid
        ? `${API_BASE}/load-series/${folderId}?series_uid=${seriesUid}`
        : `${API_BASE}/load-series/${folderId}`;

      const response = await fetch(url, { method: 'POST' });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load series');
      }

      const data = await response.json();

      // Fetch full scan with images
      const scanResponse = await fetch(`${API_BASE}/scan/${data.scan_id}`);
      if (!scanResponse.ok) {
        throw new Error('Failed to fetch scan data');
      }

      const scan: Scan = await scanResponse.json();
      setScan(scan);
      return scan;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocalPath = async (path: string): Promise<Scan | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/load-local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load DICOM');
      }

      const data = await response.json();

      const scanResponse = await fetch(`${API_BASE}/scan/${data.scan_id}`);
      if (!scanResponse.ok) {
        throw new Error('Failed to fetch scan data');
      }

      const scan: Scan = await scanResponse.json();
      setScan(scan);
      return scan;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const uploadDicom = async (files: File[]): Promise<Scan | null> => {
    if (!token) {
      setError('No API token');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Upload failed');
      }

      const data = await response.json();

      const scanResponse = await fetch(`${API_BASE}/scan/${data.scan_id}`);
      if (!scanResponse.ok) {
        throw new Error('Failed to fetch scan data');
      }

      const scan: Scan = await scanResponse.json();
      setScan(scan);
      return scan;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeScan = async (
    scanId: string,
    message: string,
    sliceIndices?: number[],
    chatHistory?: ChatMessage[]
  ): Promise<{ response: string; slicesAnalyzed: number; annotations: Annotation[] } | null> => {
    if (!token) {
      setError('No API token');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': token,
        },
        body: JSON.stringify({
          scan_id: scanId,
          message,
          slice_indices: sliceIndices,
          chat_history: chatHistory?.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Analysis failed');
      }

      const data = await response.json();
      const annotations: Annotation[] = data.annotations || [];

      // Add annotations to store
      if (annotations.length > 0) {
        addAnnotations(annotations);
      }

      return {
        response: data.response,
        slicesAnalyzed: data.slices_analyzed || 1,
        annotations,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const chat = async (
    scanId: string,
    message: string,
    chatHistory: ChatMessage[],
    includeSlice?: boolean,
    sliceIndex?: number
  ): Promise<{ response: string; annotations: Annotation[] } | null> => {
    if (!token) {
      setError('No API token');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': token,
        },
        body: JSON.stringify({
          scan_id: scanId,
          message,
          chat_history: chatHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          include_current_slice: includeSlice,
          current_slice_index: sliceIndex,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Chat failed');
      }

      const data = await response.json();
      const annotations: Annotation[] = data.annotations || [];

      // Add annotations to store
      if (annotations.length > 0) {
        addAnnotations(annotations);
      }

      return { response: data.response, annotations };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const loadMultipleSeries = async (folderId: string, seriesUids: string[]): Promise<Scan | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/load-multiple-series/${folderId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ series_uids: seriesUids }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to load series');
      }

      const data = await response.json();

      // Fetch full scan with images
      const scanResponse = await fetch(`${API_BASE}/scan/${data.scan_id}`);
      if (!scanResponse.ok) {
        throw new Error('Failed to fetch scan data');
      }

      const scan: Scan = await scanResponse.json();
      setScan(scan);
      return scan;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const aiSelectSeries = async (
    folderId: string,
    userDescription: string
  ): Promise<{ selected_uids: string[]; selected_series: any[]; total_slices: number; ai_reasoning: string } | null> => {
    if (!token) {
      setError('No API token');
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/ai-select-series/${folderId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Token': token,
        },
        body: JSON.stringify({ user_description: userDescription }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'AI selection failed');
      }

      return await response.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI selection failed');
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return { uploadDicom, loadLocalPath, scanFolder, loadSeries, loadMultipleSeries, aiSelectSeries, analyzeScan, chat, fetchModelInfo };
}
