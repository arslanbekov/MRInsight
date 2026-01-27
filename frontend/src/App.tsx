import { useEffect } from 'react';
import { useStore } from './hooks/useStore';
import { useApi } from './hooks/useApi';
import { AuthScreen } from './components/AuthScreen';
import { UploadZone } from './components/UploadZone';
import { DicomViewer } from './components/DicomViewer';
import { ChatPanel } from './components/ChatPanel';

function App() {
  const { token, setToken, scan, setScan, clearMessages, modelInfo } = useStore();
  const { fetchModelInfo } = useApi();

  // Fetch model info on mount
  useEffect(() => {
    if (token) {
      fetchModelInfo();
    }
  }, [token]);

  // Show auth screen if no token
  if (!token) {
    return <AuthScreen />;
  }

  const handleLogout = () => {
    setToken(null);
    setScan(null);
    clearMessages();
  };

  const handleNewScan = () => {
    setScan(null);
    clearMessages();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Top Bar */}
      <header className="h-14 px-4 flex items-center justify-between bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center">
            <svg className="w-7 h-7 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="3" x2="12" y2="7" />
              <line x1="12" y1="17" x2="12" y2="21" />
              <line x1="3" y1="12" x2="7" y2="12" />
              <line x1="17" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-white">MRInsight</h1>
          {modelInfo && (
            <div className="flex items-center gap-2 ml-4 px-3 py-1 bg-gray-700 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm text-gray-300">{modelInfo.display_name}</span>
              <span className="text-xs text-gray-500">({modelInfo.provider})</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {scan && (
            <button
              onClick={handleNewScan}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              New Scan
            </button>
          )}
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left Panel - Viewer or Upload */}
        <div className="flex-1 border-r border-gray-700">
          {scan ? <DicomViewer /> : <UploadZone />}
        </div>

        {/* Right Panel - Chat */}
        <div className="w-[450px] flex-shrink-0">
          <ChatPanel />
        </div>
      </main>
    </div>
  );
}

export default App;
