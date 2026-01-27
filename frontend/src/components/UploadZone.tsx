import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useApi } from '../hooks/useApi';
import { useStore } from '../hooks/useStore';

export function UploadZone() {
  const { uploadDicom, scanFolder, loadSeries, loadMultipleSeries, aiSelectSeries } = useApi();
  const { isLoading, error, folderScan, setFolderScan } = useStore();
  const [localPath, setLocalPath] = useState('');
  const [showLocalInput, setShowLocalInput] = useState(false);
  const [selectedSeriesUids, setSelectedSeriesUids] = useState<string[]>([]);
  const [aiQuery, setAiQuery] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{
    selected_uids: string[];
    selected_series: any[];
    total_slices: number;
    ai_reasoning: string;
  } | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        await uploadDicom(acceptedFiles);
      }
    },
    [uploadDicom]
  );

  const handleScanFolder = async () => {
    if (localPath.trim()) {
      await scanFolder(localPath.trim());
    }
  };

  const handleLoadSeries = async (seriesUid?: string) => {
    if (folderScan) {
      await loadSeries(folderScan.folder_id, seriesUid);
      setFolderScan(null);
    }
  };

  const handleLoadAllNonLocalizer = async () => {
    if (folderScan) {
      await loadSeries(folderScan.folder_id);
      setFolderScan(null);
    }
  };

  const toggleSeriesSelection = (uid: string) => {
    setSelectedSeriesUids((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]
    );
    setAiSuggestion(null); // Clear AI suggestion when manually selecting
  };

  const handleLoadSelected = async () => {
    if (folderScan && selectedSeriesUids.length > 0) {
      await loadMultipleSeries(folderScan.folder_id, selectedSeriesUids);
      setFolderScan(null);
      setSelectedSeriesUids([]);
      setAiSuggestion(null);
    }
  };

  const handleAiSelect = async () => {
    if (folderScan && aiQuery.trim()) {
      const result = await aiSelectSeries(folderScan.folder_id, aiQuery.trim());
      if (result) {
        setAiSuggestion(result);
        setSelectedSeriesUids(result.selected_uids);
      }
    }
  };

  const handleLoadAiSuggestion = async () => {
    if (folderScan && aiSuggestion && aiSuggestion.selected_uids.length > 0) {
      await loadMultipleSeries(folderScan.folder_id, aiSuggestion.selected_uids);
      setFolderScan(null);
      setSelectedSeriesUids([]);
      setAiSuggestion(null);
      setAiQuery('');
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/dicom': ['.dcm', '.dicom'],
      'application/octet-stream': ['.dcm', '.dicom', ''],
    },
    multiple: true,
    disabled: isLoading,
  });

  // Show series selection if we have scanned a folder
  if (folderScan) {
    const nonLocalizers = folderScan.series.filter((s) => !s.is_localizer);
    const localizers = folderScan.series.filter((s) => s.is_localizer);
    const selectedCount = selectedSeriesUids.length;
    const selectedSlices = folderScan.series
      .filter((s) => selectedSeriesUids.includes(s.uid))
      .reduce((acc, s) => acc + s.num_slices, 0);

    return (
      <div className="h-full flex flex-col p-6 overflow-auto">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white mb-2">Select Series to Load</h2>
          <p className="text-gray-400 text-sm">
            Found {folderScan.total_files} DICOM files in {folderScan.num_series} series
          </p>
          <button
            onClick={() => {
              setFolderScan(null);
              setSelectedSeriesUids([]);
              setAiSuggestion(null);
              setAiQuery('');
            }}
            className="mt-2 text-sm text-blue-400 hover:underline"
          >
            ← Back to upload
          </button>
        </div>

        {/* AI-assisted selection */}
        <div className="mb-4 p-4 bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-xl border border-purple-700/50">
          <p className="text-sm text-purple-300 mb-2 font-medium">
            AI-assisted selection
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Describe what you want to examine (e.g., "spine and lower back", "brain", "knee")
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAiSelect()}
              placeholder="What do you want to examine?"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
            <button
              onClick={handleAiSelect}
              disabled={!aiQuery.trim() || isLoading}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white text-sm font-medium rounded-lg whitespace-nowrap"
            >
              {isLoading ? 'Thinking...' : 'Find Series'}
            </button>
          </div>

          {/* AI Suggestion Result */}
          {aiSuggestion && (
            <div className="mt-3 p-3 bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-green-400">
                  AI selected {aiSuggestion.selected_series.length} series ({aiSuggestion.total_slices} slices)
                </p>
                <button
                  onClick={handleLoadAiSuggestion}
                  disabled={isLoading || aiSuggestion.selected_uids.length === 0}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white text-sm rounded-lg"
                >
                  Load Selected
                </button>
              </div>
              <div className="text-xs text-gray-400 space-y-1">
                {aiSuggestion.selected_series.map((s) => (
                  <p key={s.uid}>• #{s.series_number}: {s.description}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Manual selection header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-white">
            Scan Series ({nonLocalizers.length})
          </h3>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <span className="text-sm text-blue-400">
                {selectedCount} selected ({selectedSlices} slices)
              </span>
            )}
            {selectedCount > 0 ? (
              <button
                onClick={handleLoadSelected}
                disabled={isLoading}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white rounded-lg font-medium"
              >
                Load Selected
              </button>
            ) : (
              <button
                onClick={handleLoadAllNonLocalizer}
                disabled={isLoading}
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg"
              >
                Load All ({nonLocalizers.reduce((acc, s) => acc + s.num_slices, 0)} slices)
              </button>
            )}
          </div>
        </div>

        {/* Select/Deselect All */}
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setSelectedSeriesUids(nonLocalizers.map((s) => s.uid))}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Select All
          </button>
          <span className="text-gray-600">|</span>
          <button
            onClick={() => {
              setSelectedSeriesUids([]);
              setAiSuggestion(null);
            }}
            className="text-xs text-gray-400 hover:text-gray-300"
          >
            Clear Selection
          </button>
        </div>

        {/* Non-localizer series with checkboxes */}
        <div className="space-y-2 mb-6">
          {nonLocalizers.map((series) => {
            const isSelected = selectedSeriesUids.includes(series.uid);
            const isAiSuggested = aiSuggestion?.selected_uids.includes(series.uid);

            return (
              <div
                key={series.uid}
                onClick={() => toggleSeriesSelection(series.uid)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-blue-900/30 border-blue-500'
                    : isAiSuggested
                    ? 'bg-purple-900/20 border-purple-500/50'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-500'
                    }`}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-white font-medium">
                      #{series.series_number}: {series.description || 'Unnamed Series'}
                      {isAiSuggested && !isSelected && (
                        <span className="ml-2 text-xs text-purple-400">(AI suggested)</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-400">
                      {series.modality} • {series.num_slices} slices
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLoadSeries(series.uid);
                    }}
                    disabled={isLoading}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 text-gray-300 text-xs rounded-lg"
                  >
                    Load Only
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Localizer series (collapsed by default) */}
        {localizers.length > 0 && (
          <div>
            <details className="group">
              <summary className="cursor-pointer text-gray-500 hover:text-gray-400 text-sm mb-2">
                Localizer/Scout Images ({localizers.length} series) - usually not needed
              </summary>
              <div className="space-y-2 mt-2">
                {localizers.map((series) => (
                  <div
                    key={series.uid}
                    className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-gray-400 text-sm">
                          #{series.series_number}: {series.description || 'Localizer'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {series.num_slices} slices
                        </p>
                      </div>
                      <button
                        onClick={() => handleLoadSeries(series.uid)}
                        disabled={isLoading}
                        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded"
                      >
                        Load
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {isLoading && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400">Loading series...</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div
        {...getRootProps()}
        className={`w-full max-w-lg p-12 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800/50'
        } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />

        {isLoading ? (
          <div className="space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-300">Processing DICOM files...</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto bg-gray-700 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-medium text-white">
                {isDragActive ? 'Drop files here' : 'Upload DICOM Files'}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                Drag & drop .dcm files or click to browse
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Local Path Input */}
      <div className="mt-6 w-full max-w-lg">
        <button
          onClick={() => setShowLocalInput(!showLocalInput)}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          {showLocalInput ? 'Hide' : 'Load from local folder (recommended)'}
        </button>

        {showLocalInput && (
          <div className="mt-3 space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder="/path/to/DICOM/folder"
                disabled={isLoading}
                className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleScanFolder}
                disabled={!localPath.trim() || isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-medium rounded-lg"
              >
                Scan
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Scans folder first to show available series, then you choose which to load
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 max-w-lg">
          {error}
        </div>
      )}

      <div className="mt-8 text-center text-gray-500 text-sm max-w-md">
        <p className="font-medium text-gray-400 mb-2">How it works:</p>
        <ol className="text-left list-decimal list-inside space-y-1">
          <li>Scan folder to see available series</li>
          <li>Choose which series to load (localizers filtered)</li>
          <li>AI analyzes ~10 evenly distributed slices (not all!)</li>
          <li>Ask follow-up questions about specific slices</li>
        </ol>
      </div>
    </div>
  );
}
