import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useStore } from '../hooks/useStore';
import { useApi } from '../hooks/useApi';

type AnalyzeMode = 'overview' | 'current' | 'selected' | 'all';

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [analyzeMode, setAnalyzeMode] = useState<AnalyzeMode>('overview');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    scan,
    currentSlice,
    selectedSlices,
    messages,
    addMessage,
    isLoading,
    error,
  } = useStore();
  const { analyzeScan, chat } = useApi();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getSlicesToAnalyze = (): number[] | undefined => {
    switch (analyzeMode) {
      case 'current':
        return [currentSlice];
      case 'selected':
        return selectedSlices.length > 0 ? selectedSlices : [currentSlice];
      case 'all':
        // Return all slice indices
        return scan ? Array.from({ length: scan.num_slices }, (_, i) => i) : undefined;
      case 'overview':
      default:
        return undefined; // Backend will select representative slices
    }
  };

  const getModeDescription = (): string => {
    if (!scan) return '';
    switch (analyzeMode) {
      case 'current':
        return `Current slice (#${currentSlice + 1})`;
      case 'selected':
        return selectedSlices.length > 0
          ? `${selectedSlices.length} selected slices`
          : `Current slice (#${currentSlice + 1})`;
      case 'all':
        return `All ${scan.num_slices} slices (may be slow & costly)`;
      case 'overview':
        return `Overview (~10 evenly distributed from ${scan.num_slices} total)`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !scan || isLoading) return;

    const userMessage = input.trim();
    setInput('');

    const slicesToAnalyze = getSlicesToAnalyze();

    addMessage({
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      sliceIndex: analyzeMode === 'current' ? currentSlice : undefined,
    });

    let result: { response: string; slicesAnalyzed: number; annotations?: import('../types').Annotation[] } | null;

    if (messages.length === 0) {
      result = await analyzeScan(
        scan.scan_id,
        userMessage,
        slicesToAnalyze,
        undefined
      );
    } else {
      const chatResponse = await chat(
        scan.scan_id,
        userMessage,
        messages,
        analyzeMode === 'current',
        currentSlice
      );
      result = chatResponse ? { response: chatResponse.response, slicesAnalyzed: 1, annotations: chatResponse.annotations } : null;
    }

    if (result) {
      addMessage({
        role: 'assistant',
        content: result.response,
        timestamp: new Date(),
        slicesAnalyzed: result.slicesAnalyzed,
        annotations: result.annotations,
      });
    }
  };

  const handleQuickAction = (action: string) => {
    if (!scan || isLoading) return;

    let message = '';
    switch (action) {
      case 'analyze':
        message =
          'Please analyze this MRI scan. Look for any anomalies, unusual findings, or areas that might need attention. Provide a structured assessment.';
        break;
      case 'explain':
        message =
          "Explain what I'm seeing in this image. Describe the visible anatomical structures and any notable features.";
        break;
      case 'compare':
        message =
          'Compare what you see to typical healthy anatomy. Note any differences or variations that stand out.';
        break;
    }

    setInput(message);
  };

  if (!scan) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-900 text-gray-500 p-6">
        <div className="text-center">
          <p className="mb-4">Upload a DICOM scan to start analysis</p>
          <div className="text-xs text-gray-600 space-y-1">
            <p>AI will analyze ~10 representative slices</p>
            <p>You can ask about specific slices after</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-medium">AI Analysis</h2>
        <p className="text-sm text-gray-400">
          {scan.num_slices} slices loaded
        </p>
      </div>

      {/* Analysis Mode Selector */}
      <div className="p-3 border-b border-gray-700 bg-gray-800/50">
        <p className="text-xs text-gray-500 mb-2">Analyze mode:</p>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setAnalyzeMode('overview')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              analyzeMode === 'overview'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Overview (~10 slices)
          </button>
          <button
            onClick={() => setAnalyzeMode('current')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              analyzeMode === 'current'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Current (#{currentSlice + 1})
          </button>
          <button
            onClick={() => setAnalyzeMode('selected')}
            disabled={selectedSlices.length === 0}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              analyzeMode === 'selected'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50'
            }`}
          >
            Selected ({selectedSlices.length})
          </button>
          <button
            onClick={() => setAnalyzeMode('all')}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              analyzeMode === 'all'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All ({scan?.num_slices || 0})
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">{getModeDescription()}</p>
      </div>

      {/* Quick Actions */}
      {messages.length === 0 && (
        <div className="p-3 border-b border-gray-700">
          <p className="text-xs text-gray-500 mb-2">Quick actions:</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleQuickAction('analyze')}
              className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs rounded-lg"
            >
              Full Analysis
            </button>
            <button
              onClick={() => handleQuickAction('explain')}
              className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 text-xs rounded-lg"
            >
              Explain Structures
            </button>
            <button
              onClick={() => handleQuickAction('compare')}
              className="px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 text-xs rounded-lg"
            >
              Compare to Normal
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-3 ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-100'
              }`}
            >
              {msg.sliceIndex !== undefined && (
                <p className="text-xs opacity-70 mb-1">[Slice #{msg.sliceIndex + 1}]</p>
              )}
              {msg.slicesAnalyzed && msg.slicesAnalyzed > 1 && (
                <p className="text-xs opacity-70 mb-1">
                  [Analyzed {msg.slicesAnalyzed} slices]
                </p>
              )}
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                <div
                  className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                />
                <div
                  className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
                <span className="text-xs text-gray-400 ml-2">Analyzing...</span>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this scan..."
            disabled={isLoading}
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
          >
            Send
          </button>
        </div>
      </form>

      {/* Disclaimer */}
      <div className="px-4 pb-3">
        <p className="text-xs text-gray-600 text-center">
          AI analysis is for informational purposes only. Consult a radiologist for medical advice.
        </p>
      </div>
    </div>
  );
}
