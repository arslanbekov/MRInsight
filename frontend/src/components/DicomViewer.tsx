import { useStore } from '../hooks/useStore';

export function DicomViewer() {
  const {
    scan,
    currentSlice,
    setCurrentSlice,
    selectedSlices,
    toggleSliceSelection,
    setSelectedSlices,
    annotations,
  } = useStore();

  // Get annotations for current slice (1-indexed in annotations)
  const currentSliceAnnotations = annotations.filter(
    (a) => a.slice === currentSlice + 1
  );

  const getSeverityColor = (severity: 'info' | 'warning' | 'critical') => {
    switch (severity) {
      case 'critical':
        return { bg: 'bg-red-500', border: 'border-red-400', text: 'text-red-100' };
      case 'warning':
        return { bg: 'bg-yellow-500', border: 'border-yellow-400', text: 'text-yellow-100' };
      default:
        return { bg: 'bg-blue-500', border: 'border-blue-400', text: 'text-blue-100' };
    }
  };

  if (!scan) return null;

  const totalSlices = scan.images.length;
  const currentImage = scan.images[currentSlice];
  const isSelected = selectedSlices.includes(currentSlice);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentSlice(parseInt(e.target.value, 10));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0 && currentSlice < totalSlices - 1) {
      setCurrentSlice(currentSlice + 1);
    } else if (e.deltaY < 0 && currentSlice > 0) {
      setCurrentSlice(currentSlice - 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      if (currentSlice < totalSlices - 1) setCurrentSlice(currentSlice + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      if (currentSlice > 0) setCurrentSlice(currentSlice - 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleSliceSelection(currentSlice);
    }
  };

  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="p-4 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-medium">
              {scan.metadata.series_description ||
                scan.metadata.study_description ||
                'MRI Scan'}
            </h2>
            <p className="text-sm text-gray-400">
              {scan.metadata.modality} • {scan.metadata.body_part || 'Unknown'} •{' '}
              {scan.metadata.study_date}
            </p>
          </div>
          <div className="text-right">
            <p className="text-white font-mono">
              Slice {currentSlice + 1} / {totalSlices}
            </p>
            <p className="text-xs text-gray-500">
              {scan.metadata.rows} x {scan.metadata.columns} px
            </p>
          </div>
        </div>
      </div>

      {/* Selection Info */}
      {selectedSlices.length > 0 && (
        <div className="px-4 py-2 bg-blue-900/30 border-b border-blue-800 flex items-center justify-between">
          <p className="text-sm text-blue-300">
            {selectedSlices.length} slice(s) selected:{' '}
            {selectedSlices.map((s) => s + 1).join(', ')}
          </p>
          <button
            onClick={() => setSelectedSlices([])}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Image Container */}
      <div
        className="flex-1 flex items-center justify-center p-4 outline-none relative"
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div className="relative">
          <img
            src={`data:image/png;base64,${currentImage}`}
            alt={`Slice ${currentSlice + 1}`}
            className={`max-w-full max-h-full object-contain ${
              isSelected ? 'ring-4 ring-blue-500' : ''
            }`}
            style={{ imageRendering: 'pixelated' }}
          />

          {/* Annotation markers */}
          {currentSliceAnnotations.map((annotation, idx) => {
            const colors = getSeverityColor(annotation.severity);
            return (
              <div
                key={idx}
                className="absolute group"
                style={{
                  left: `${annotation.x}%`,
                  top: `${annotation.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {/* Marker */}
                <div
                  className={`w-6 h-6 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center cursor-pointer animate-pulse`}
                >
                  <span className="text-white text-xs font-bold">{idx + 1}</span>
                </div>

                {/* Tooltip */}
                <div className="absolute left-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                  <div className={`${colors.bg} ${colors.text} px-3 py-2 rounded-lg text-sm whitespace-nowrap shadow-lg max-w-xs`}>
                    <p className="font-medium">{annotation.label}</p>
                    <p className="text-xs opacity-80 capitalize">{annotation.severity}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-6 right-6 bg-blue-600 text-white px-2 py-1 rounded text-xs">
            Selected
          </div>
        )}

        {/* Annotations count for current slice */}
        {currentSliceAnnotations.length > 0 && (
          <div className="absolute top-6 left-6 bg-gray-800/90 text-white px-3 py-1 rounded text-xs">
            {currentSliceAnnotations.length} finding(s) on this slice
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 bg-gray-900 border-t border-gray-700">
        {/* Slice Selection Button */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => toggleSliceSelection(currentSlice)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {isSelected ? 'Selected for Analysis' : 'Select This Slice'}
          </button>

          <p className="text-xs text-gray-500">
            Press Space to toggle selection
          </p>
        </div>

        {/* Slider */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setCurrentSlice(Math.max(0, currentSlice - 1))}
            disabled={currentSlice === 0}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="flex-1 relative">
            <input
              type="range"
              min={0}
              max={totalSlices - 1}
              value={currentSlice}
              onChange={handleSliderChange}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            {/* Selected slice markers */}
            <div className="absolute top-0 left-0 right-0 h-2 pointer-events-none">
              {selectedSlices.map((idx) => (
                <div
                  key={idx}
                  className="absolute w-1 h-2 bg-blue-500"
                  style={{
                    left: `${(idx / (totalSlices - 1)) * 100}%`,
                    transform: 'translateX(-50%)',
                  }}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() =>
              setCurrentSlice(Math.min(totalSlices - 1, currentSlice + 1))
            }
            disabled={currentSlice === totalSlices - 1}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <p className="text-center text-xs text-gray-500 mt-2">
          Mouse wheel / Arrow keys to navigate • Space to select
        </p>
      </div>

      {/* Annotations Panel */}
      {annotations.length > 0 && (
        <div className="p-3 bg-gray-800 border-t border-gray-700 max-h-40 overflow-y-auto">
          <p className="text-xs text-gray-400 mb-2 font-medium">
            AI Findings ({annotations.length})
          </p>
          <div className="space-y-1">
            {annotations.map((annotation, idx) => {
              const colors = getSeverityColor(annotation.severity);
              const isOnCurrentSlice = annotation.slice === currentSlice + 1;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentSlice(annotation.slice - 1)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs flex items-center gap-2 transition-colors ${
                    isOnCurrentSlice
                      ? `${colors.bg} text-white`
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  <span className={`w-5 h-5 ${isOnCurrentSlice ? 'bg-white/20' : colors.bg} rounded-full flex items-center justify-center text-white text-xs font-bold`}>
                    {idx + 1}
                  </span>
                  <span className="flex-1 truncate">{annotation.label}</span>
                  <span className="text-gray-400">Slice {annotation.slice}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
