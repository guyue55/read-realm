/**
 * AI 用户配置模块
 * 
 * 安全设计：
 * 1. 用户 API Key 等敏感信息通过 Web Crypto API (AES-GCM) 加密后存储在本地 IndexedDB
 * 2. 加密密钥由设备指纹 + 固定盐值派生，同一设备可解密，更换设备需重新配置
 * 3. 用户配置优先于服务端环境变量，充分保护用户隐私
 * 4. 无配置时提供友好提示，不阻塞阅读功能
 */

export interface AIUserConfig {
  /** OpenAI 兼容的 API Base URL */
  baseUrl: string;
  /** API Key（明文，仅内存中使用） */
  apiKey: string;
  /** 模型名称 */
  model: string;
  /** API 格式，当前仅支持 openai */
  format: 'openai';
}

export interface EncryptedConfig {
  /** 加密后的 API Key (base64) */
  encryptedKey: string;
  /** 加密后的 Base URL (base64) */
  encryptedBaseUrl: string;
  /** 加密初始化向量 + 盐 (base64，以 . 分隔) */
  iv: string;
  /** 模型名称（非敏感，明文存储） */
  model: string;
  /** API 格式 */
  format: 'openai';
  /** 配置更新时间 */
  updatedAt: string;
}

export const DEFAULT_AI_CONFIG: Partial<AIUserConfig> = {
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
  format: 'openai',
};

const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 200000;

/**
 * 从密码派生 AES-GCM 加密密钥
 */
async function deriveKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * 加密用户 AI 配置
 */
export async function encryptAIConfig(
  config: AIUserConfig,
  deviceFingerprint: string,
): Promise<EncryptedConfig> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(deviceFingerprint, salt.buffer);

  const enc = new TextEncoder();

  const encryptedKeyBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    key,
    enc.encode(config.apiKey),
  );

  const encryptedBaseUrlBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer },
    key,
    enc.encode(config.baseUrl),
  );

  return {
    encryptedKey: arrayBufferToBase64(encryptedKeyBuf),
    encryptedBaseUrl: arrayBufferToBase64(encryptedBaseUrlBuf),
    iv: arrayBufferToBase64(iv.buffer) + '.' + arrayBufferToBase64(salt.buffer),
    model: config.model,
    format: config.format,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 解密用户 AI 配置
 */
export async function decryptAIConfig(
  encrypted: EncryptedConfig,
  deviceFingerprint: string,
): Promise<AIUserConfig | null> {
  try {
    const parts = encrypted.iv.split('.');
    if (parts.length !== 2) return null;
    const iv = base64ToArrayBuffer(parts[0]!);
    const salt = base64ToArrayBuffer(parts[1]!);
    const key = await deriveKey(deviceFingerprint, salt);

    const encryptedKeyData = base64ToArrayBuffer(encrypted.encryptedKey as string);
    const encryptedUrlData = base64ToArrayBuffer(encrypted.encryptedBaseUrl as string);

    const decryptedKeyBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedKeyData,
    );

    const decryptedBaseUrlBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedUrlData,
    );

    const dec = new TextDecoder();
    return {
      apiKey: dec.decode(decryptedKeyBuf),
      baseUrl: dec.decode(decryptedBaseUrlBuf),
      model: encrypted.model,
      format: encrypted.format,
    };
  } catch {
    // 解密失败：密钥不匹配或数据损坏
    return null;
  }
}

/**
 * 生成设备指纹
 */
export function generateDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server-side';

  const stored = window.localStorage.getItem('_rd_fp');
  if (stored) return stored;

  const components = [
    navigator.hardwareConcurrency || 'unknown',
    navigator.language || 'unknown',
    screen.colorDepth || 'unknown',
    screen.width || 'unknown',
    screen.height || 'unknown',
    String(new Date().getTimezoneOffset()),
  ];

  const fp = components.join('|');
  let hash = 0;
  for (let i = 0; i < fp.length; i++) {
    const char = fp.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const fingerprint = 'fp_' + Math.abs(hash).toString(36);

  try {
    window.localStorage.setItem('_rd_fp', fingerprint);
  } catch {
    // localStorage 不可用
  }

  return fingerprint;
}

/**
 * 判断是否配置了可用的 AI
 */
export function hasAIConfig(config: AIUserConfig | null): boolean {
  return config !== null && config.apiKey.length > 0;
}
