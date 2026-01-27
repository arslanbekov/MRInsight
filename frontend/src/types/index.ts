export interface ScanMetadata {
  patient_name: string;
  patient_id: string;
  study_date: string;
  modality: string;
  body_part: string;
  study_description: string;
  series_description: string;
  rows: number;
  columns: number;
  slice_thickness: number;
  pixel_spacing: number[];
  num_slices: number;
}

export interface Scan {
  scan_id: string;
  metadata: ScanMetadata;
  images: string[];
  num_slices: number;
}

export interface SeriesInfo {
  uid: string;
  series_number: number;
  description: string;
  modality: string;
  num_slices: number;
  is_localizer: boolean;
}

export interface FolderScanResult {
  folder_id: string;
  path: string;
  total_files: number;
  series: SeriesInfo[];
  num_series: number;
  num_localizers: number;
}

export interface Annotation {
  slice: number;
  x: number;
  y: number;
  label: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sliceIndex?: number;
  slicesAnalyzed?: number;
  annotations?: Annotation[];
}

export interface ModelInfo {
  model_id: string;
  display_name: string;
  provider: string;
}

export interface AppState {
  token: string | null;
  setToken: (token: string | null) => void;

  scan: Scan | null;
  setScan: (scan: Scan | null) => void;

  folderScan: FolderScanResult | null;
  setFolderScan: (scan: FolderScanResult | null) => void;

  currentSlice: number;
  setCurrentSlice: (slice: number) => void;

  selectedSlices: number[];
  setSelectedSlices: (slices: number[]) => void;
  toggleSliceSelection: (index: number) => void;

  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  clearMessages: () => void;

  annotations: Annotation[];
  setAnnotations: (annotations: Annotation[]) => void;
  addAnnotations: (annotations: Annotation[]) => void;

  modelInfo: ModelInfo | null;
  setModelInfo: (info: ModelInfo | null) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  error: string | null;
  setError: (error: string | null) => void;
}
