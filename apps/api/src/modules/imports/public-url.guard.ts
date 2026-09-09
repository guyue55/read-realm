import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * @file public-url.guard.ts
 * @description URL 导入相关服务的共享守门与抓取工具。
 *
 * 职责：
 * - assertPublicUrl：SSRF 四重校验（协议/凭据/本机内网 host/内网 DNS 解析）；
 * - fetchPublicHtml：带重定向链、UA、超时、大小上限、反爬检测的静态抓取；
 * - stripHtml / toAbsoluteUrl / blockedPagePattern：抓取与解析的通用工具。
 *
 * 被 url-import.service（解析兜底）与 proxy-fetch.service（L1 网络桥）复用，
 * 避免同一套守门逻辑两处复制。
 */

const MAX_REDIRECTS = 5;
export const REQUEST_TIMEOUT_MS = 15000;
/** 静态抓取响应大小上限（字节，10MB，防超大页面拖垮内存） */
export const MAX_FETCH_BYTES = 10 * 1024 * 1024;

/** 反爬/风控/拦截页特征（与前端 anti-scrape 保持一致并保守扩展） */
export const blockedPagePattern =
  /(验证码|访问过于频繁|安全验证|人机验证|登录后(?:阅读|查看)|会员专享|付费阅读|订阅后|请开启javascript|enable javascript|checking your browser|just a moment|cloudflare|access denied|forbidden|sign in|log in|paywall|subscribe to read)/i;

export function normalizeWhitespace(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripHtml(value: string) {
  return normalizeWhitespace(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<(br|p|div|li|h[1-6])\b[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"'),
  );
}

export function toAbsoluteUrl(href: string, baseUrl: string) {
  try {
    const url = new URL(href, baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function isPrivateHost(host: string) {
  const isIpv6Literal = host.startsWith('[') && host.endsWith(']');
  const bareHost = isIpv6Literal ? host.slice(1, -1) : host;
  const isPrivateIpv4 =
    host.startsWith('127.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  const isPrivateIpv6 =
    bareHost === '::1' ||
    bareHost === '::' ||
    bareHost.startsWith('fc') ||
    bareHost.startsWith('fd') ||
    bareHost.startsWith('fe80:') ||
    bareHost.startsWith('::ffff:127.') ||
    bareHost.startsWith('::ffff:10.') ||
    bareHost.startsWith('::ffff:192.168.') ||
    bareHost.startsWith('::ffff:169.254.');

  return (
    host === 'localhost' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0' ||
    host === 'broadcasthost' ||
    isPrivateIpv4 ||
    isPrivateIpv6
  );
}

function isPrivateAddress(address: string) {
  if (isIP(address) === 4) return isPrivateHost(address);
  const normalized = address.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('::ffff:127.') ||
    normalized.startsWith('::ffff:10.') ||
    normalized.startsWith('::ffff:192.168.') ||
    normalized.startsWith('::ffff:169.254.')
  );
}

/**
 * SSRF 守门：校验 URL 为可公开访问的 http(s) 地址。
 * 拒绝非 http(s)、内嵌凭据、本机/内网 host、解析到内网的域名。
 */
export async function assertPublicUrl(rawUrl: string) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new BadRequestException('请提供需要解析的 URL');
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('URL 格式不正确');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('仅支持 HTTP/HTTPS 链接');
  }
  if (url.username || url.password) {
    throw new BadRequestException('链接不得包含用户名或密码');
  }

  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) {
    throw new BadRequestException('不允许访问本机或内网地址');
  }

  try {
    const records = await lookup(host, { all: true });
    if (records.some((record) => isPrivateAddress(record.address))) {
      throw new BadRequestException('不允许访问解析到内网的地址');
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('URL 域名解析失败');
  }

  return url.toString();
}

export interface PublicFetchResult {
  html: string;
  finalUrl: string;
}

/**
 * 带守门的静态抓取：SSRF 校验 → 手动重定向链（每次重定向重过守门）→ 大小上限 → 反爬检测。
 * 供 L1 网络桥与后端解析兜底共用。
 */
export async function fetchPublicHtml(
  rawUrl: string,
): Promise<PublicFetchResult> {
  let response: Response | null = null;
  let currentUrl = await assertPublicUrl(rawUrl);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      response = await fetch(currentUrl, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        redirect: 'manual',
        headers: {
          accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
          'user-agent': 'ReadRealm/0.1 (local authorized public-source import)',
        },
      });
      if (
        response.status < 300 ||
        response.status >= 400 ||
        !response.headers.get('location')
      ) {
        break;
      }
      const nextUrl = toAbsoluteUrl(
        response.headers.get('location') || '',
        currentUrl,
      );
      if (!nextUrl) throw new BadRequestException('页面跳转地址不支持');
      currentUrl = await assertPublicUrl(nextUrl);
    }
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('页面请求失败或超时，请稍后重试');
  }

  if (!response) {
    throw new BadRequestException('页面请求失败或超时，请稍后重试');
  }
  if (!response.ok) {
    throw new BadRequestException(`页面请求失败：HTTP ${response.status}`);
  }

  // 响应大小上限保护
  const contentLength = Number(response.headers.get('content-length') || '0');
  if (contentLength > MAX_FETCH_BYTES) {
    throw new BadRequestException('页面响应超过大小上限');
  }

  const html = await response.text();
  if (html.length > MAX_FETCH_BYTES) {
    throw new BadRequestException('页面响应超过大小上限');
  }

  const sample = stripHtml(html).slice(0, 3000);
  if (blockedPagePattern.test(sample)) {
    throw new BadRequestException(
      '页面需要登录、付费、验证码或触发反爬；来源边界禁止继续解析',
    );
  }
  return { html, finalUrl: response.url || currentUrl };
}
