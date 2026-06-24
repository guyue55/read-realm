/**
 * 客户端 AI 配置管理
 * 
 * 流程：
 * 1. 用户在设置面板输入 API Key、Base URL、Model
 * 2. 配置通过 Web Crypto API AES-GCM 加密后存入 IndexedDB
 * 3. 使用时解密，优先于服务端配置，通过请求头传递给后端
 * 4. 后端优先使用用户配置，若无则使用服务端环境变量，若均无则返回友好提示
 */

import { db } from '@reader/storage-core';
import type {
  AIUserConfig,
  EncryptedConfig,
} from '@reader/ai-core';
import {
  encryptAIConfig,
  decryptAIConfig,
  generateDeviceFingerprint,
  DEFAULT_AI_CONFIG,
  hasAIConfig,
} from '@reader/ai-core';
import { apiUrl } from './api';

export type { AIUserConfig };
export { hasAIConfig, DEFAULT_AI_CONFIG, generateDeviceFingerprint };

const AI_CONFIG_ID = 'user-ai-config';

/**
 * 从 IndexedDB 加载用户加密的 AI 配置并解密
 */
export async function loadUserAIConfig(): Promise<AIUserConfig | null> {
  if (typeof window === 'undefined') return null;

  try {
    const record = await db.aiUserConfigs.get(AI_CONFIG_ID);
    if (!record) return null;

    const fingerprint = generateDeviceFingerprint();
    const encrypted: EncryptedConfig = {
      encryptedKey: record.encryptedKey,
      encryptedBaseUrl: record.encryptedBaseUrl,
      iv: record.iv,
      model: record.model,
      format: record.format as 'openai',
      updatedAt: record.updatedAt,
    };

    return await decryptAIConfig(encrypted, fingerprint);
  } catch {
    return null;
  }
}

/**
 * 保存用户 AI 配置（加密存储）
 */
export async function saveUserAIConfig(config: AIUserConfig): Promise<void> {
  if (typeof window === 'undefined') return;

  const fingerprint = generateDeviceFingerprint();
  const encrypted = await encryptAIConfig(config, fingerprint);

  await db.aiUserConfigs.put({
    id: AI_CONFIG_ID,
    encryptedKey: encrypted.encryptedKey,
    encryptedBaseUrl: encrypted.encryptedBaseUrl,
    iv: encrypted.iv,
    model: encrypted.model,
    format: encrypted.format,
    updatedAt: encrypted.updatedAt,
  });
}

/**
 * 删除用户 AI 配置
 */
export async function deleteUserAIConfig(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    await db.aiUserConfigs.delete(AI_CONFIG_ID);
  } catch {
    // 忽略删除错误
  }
}

/**
 * 获取 AI 请求头（包含用户配置，如果有的话）
 * 用户自己的配置通过请求头传递给后端，后端会优先使用
 */
export async function getAIConfigHeaders(): Promise<Record<string, string>> {
  const config = await loadUserAIConfig();
  if (!config) return {};

  return {
    'x-ai-api-key': config.apiKey,
    'x-ai-base-url': config.baseUrl,
    'x-ai-model': config.model,
    'x-ai-format': config.format,
  };
}

/**
 * 检查 AI 功能是否可用
 * 检查顺序：本地用户配置 → 后端服务配置
 */
export async function isAIAvailable(): Promise<{
  available: boolean;
  source: 'user' | 'server' | 'none';
}> {
  const userConfig = await loadUserAIConfig();
  if (hasAIConfig(userConfig)) {
    return { available: true, source: 'user' };
  }

  // 检查后端是否有全局 AI 配置
  try {
    // 直接走 apiUrl() 指向真实后端，避免相对路径在 PWA / 多端壳里被 Service Worker 误导致 404。
    const response = await fetch(apiUrl('/ai/status'));
    if (response.ok) {
      const data = await response.json();
      if (data.available) {
        return { available: true, source: 'server' };
      }
    }
  } catch {
    // 网络不可用或无后端
  }

  return { available: false, source: 'none' };
}
