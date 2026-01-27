import { useState } from 'react';
import { useStore } from '../hooks/useStore';

export function AuthScreen() {
  const [inputToken, setInputToken] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { setToken } = useStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = inputToken.trim();

    if (!token) return;

    // Check format locally first
    if (!token.startsWith('sk-ant-api') && !token.startsWith('sk-ant-oat')) {
      setError('Invalid token format. Token should start with "sk-ant-api" or "sk-ant-oat"');
      return;
    }

    setIsValidating(true);
    setError(null);

    try {
      const response = await fetch('/api/validate-token', {
        method: 'POST',
        headers: {
          'X-API-Token': token,
        },
      });

      const data = await response.json();

      if (data.valid) {
        setToken(token);
      } else {
        setError(data.error || 'Invalid token');
      }
    } catch (err) {
      setError('Failed to validate token. Is the backend running?');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-cyan-400 rounded-2xl opacity-20"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-12 h-12 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="3" x2="12" y2="7" />
                <line x1="12" y1="17" x2="12" y2="21" />
                <line x1="3" y1="12" x2="7" y2="12" />
                <line x1="17" y1="12" x2="21" y2="12" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            MRInsight
          </h1>
          <p className="text-gray-400">
            AI-powered MRI scan analysis using Claude
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="token"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Claude API Token
            </label>
            <input
              id="token"
              type="password"
              value={inputToken}
              onChange={(e) => {
                setInputToken(e.target.value);
                setError(null);
              }}
              placeholder="sk-ant-api03-..."
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-2 text-xs text-gray-500">
              Get your API key from{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!inputToken.trim() || isValidating}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {isValidating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Validating...
              </>
            ) : (
              'Start Analyzing'
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">
            This tool is for educational purposes only. Always consult a
            qualified radiologist for medical interpretation.
          </p>
        </div>
      </div>
    </div>
  );
}
