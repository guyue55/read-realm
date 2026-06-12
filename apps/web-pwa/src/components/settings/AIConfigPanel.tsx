'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  loadUserAIConfig,
  saveUserAIConfig,
  deleteUserAIConfig,
  isAIAvailable,
  DEFAULT_AI_CONFIG,
  type AIUserConfig,
} from '@/lib/ai-config';


export function AIConfigPanel({ isDark = false }: { isDark?: boolean }) {
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(DEFAULT_AI_CONFIG.baseUrl || '');
  const [model, setModel] = useState(DEFAULT_AI_CONFIG.model || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [aiStatus, setAiStatus] = useState<{ available: boolean; source: string }>({
    available: false,
    source: 'none',
  });
  const [showKey, setShowKey] = useState(false);

  const inputBg = isDark ? 'bg-white/5 border-white/10' : 'bg-[#FAF9F6] border-[#E5E0D5]';
  const textColor = isDark ? 'text-[#CFCFCF]' : 'text-[#2F2A24]';
  const mutedText = isDark ? 'text-[#8F8F8F]' : 'text-[#6F665B]';

  useEffect(() => {
    loadUserAIConfig().then((config) => {
      if (config) {
        setApiKey(config.apiKey);
        setBaseUrl(config.baseUrl);
        setModel(config.model);
      }
    });
    isAIAvailable().then(setAiStatus);
  }, []);

  const handleSave = useCallback(async () => {
    if (!apiKey.trim()) {
      setStatus('error');
      return;
    }

    setSaving(true);
    try {
      const config: AIUserConfig = {
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_AI_CONFIG.baseUrl!,
        model: model.trim() || DEFAULT_AI_CONFIG.model!,
        format: 'openai',
      };
      await saveUserAIConfig(config);
      setStatus('saved');
      setAiStatus({ available: true, source: 'user' });
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    } finally {
      setSaving(false);
    }
  }, [apiKey, baseUrl, model]);

  const handleDelete = useCallback(async () => {
    setApiKey('');
    setBaseUrl(DEFAULT_AI_CONFIG.baseUrl || '');
    setModel(DEFAULT_AI_CONFIG.model || '');
    await deleteUserAIConfig();
    isAIAvailable().then(setAiStatus);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-bold ${textColor}`}>
          AI 配置
        </h3>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
          aiStatus.available
            ? aiStatus.source === 'user'
              ? 'bg-[#678055]/15 text-[#678055]'
              : 'bg-[#9A6A3A]/15 text-[#9A6A3A]'
            : 'bg-[#C4A484]/15 text-[#8C6239]'
        }`}>
          {aiStatus.available
            ? aiStatus.source === 'user'
              ? '个人密钥'
              : '服务端'
            : '未配置'}
        </span>
      </div>

      {!aiStatus.available && (
        <div className={`text-xs ${mutedText} leading-relaxed p-3 rounded-lg ${inputBg} border`}>
          尚未配置 AI 服务。请输入你的 OpenAI 兼容 API 密钥以启用 AI 伴读功能。
          密钥仅在你的设备本地加密保存，不会上传到服务器。
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className={`text-xs font-semibold ${mutedText} mb-1.5 block`}>
            API Key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className={`w-full px-3 py-2 text-sm rounded-lg border ${inputBg} ${textColor} pr-16 focus:outline-none focus:border-[#678055] transition-colors`}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className={`absolute right-2 top-1/2 -translate-y-1/2 text-xs ${mutedText} hover:opacity-80 px-2 py-1`}
            >
              {showKey ? '隐藏' : '显示'}
            </button>
          </div>
        </div>

        <div>
          <label className={`text-xs font-semibold ${mutedText} mb-1.5 block`}>
            Base URL
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className={`w-full px-3 py-2 text-sm rounded-lg border ${inputBg} ${textColor} focus:outline-none focus:border-[#678055] transition-colors`}
          />
          <p className={`text-[10px] ${mutedText} mt-1`}>
            支持任何 OpenAI 兼容 API（如 DeepSeek、Moonshot 等）
          </p>
        </div>

        <div>
          <label className={`text-xs font-semibold ${mutedText} mb-1.5 block`}>
            模型
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="gpt-3.5-turbo"
            className={`w-full px-3 py-2 text-sm rounded-lg border ${inputBg} ${textColor} focus:outline-none focus:border-[#678055] transition-colors`}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !apiKey.trim()}
          className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
            saving || !apiKey.trim()
              ? 'bg-[#E5E0D5] text-[#9D978D] cursor-not-allowed'
              : status === 'saved'
                ? 'bg-[#678055] text-white'
                : 'bg-[#678055] text-white hover:bg-[#556b46] active:scale-[0.98]'
          }`}
        >
          {saving ? '保存中...' : status === 'saved' ? '已保存 ✓' : '保存配置'}
        </button>
        {apiKey && (
          <button
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[#C4A484]/30 text-[#8C6239] hover:bg-[#C4A484]/10 active:scale-[0.98] transition-all"
          >
            清除
          </button>
        )}
      </div>

      {status === 'error' && (
        <p className="text-xs text-red-500">保存失败，请检查后重试</p>
      )}

      <p className={`text-[10px] ${mutedText} leading-relaxed pt-1`}>
        你的 API 密钥使用 AES-GCM 加密后存储在浏览器本地，
        仅在使用 AI 功能时通过 HTTPS 加密传输。
        你也可以在服务端通过环境变量 OPENAI_API_KEY 配置全局密钥。
      </p>
    </div>
  );
}
