import { useState, useEffect } from 'react';
import { dailyApi } from '../../services/dailyApi';

export default function DailySettings() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    dailyApi.settings.get()
      .then(data => {
        setSettings(data);
        setApiKey(data.openrouter_api_key || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      await dailyApi.settings.update({
        ...settings,
        openrouter_api_key: apiKey || undefined,
      });
      setMessage('Saved!');
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Daily Todo Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure AI breakdown and other preferences</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <h2 className="font-semibold text-gray-700">AI Task Breakdown</h2>
        <p className="text-sm text-gray-500">
          Uses OpenRouter with MiniMax to break down large tasks into small, actionable subtasks.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">OpenRouter API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-or-..."
            className="w-full max-w-md rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Get a key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">openrouter.ai/keys</a>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
        {message && (
          <span className={`text-sm ${message.startsWith('Error') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
