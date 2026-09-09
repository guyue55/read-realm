import { BadRequestException } from '@nestjs/common';
import { HeadlessFetchService } from './headless-fetch.service';

jest.mock('puppeteer-core', () => ({
  __esModule: true,
  default: {
    launch: jest.fn(),
  },
}));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(() => true),
}));

jest.mock('dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

import puppeteer from 'puppeteer-core';

function mockPage(html: string, url: string) {
  return {
    setUserAgent: jest.fn(),
    setExtraHTTPHeaders: jest.fn(),
    goto: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue(url),
    content: jest.fn().mockResolvedValue(html),
  };
}

describe('HeadlessFetchService (L2 headless 渲染)', () => {
  let service: HeadlessFetchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HeadlessFetchService();
  });

  it('渲染成功返回 HTML 与 ok meta', async () => {
    const page = mockPage(
      '<html><body><p>动态渲染后的正文</p></body></html>',
      'https://example.com/ch/1',
    );
    (puppeteer.launch as jest.Mock).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    });

    const result = await service.render('https://example.com/ch/1');
    expect(result.html).toContain('动态渲染后的正文');
    expect(result.meta).toBe('ok');
    expect(result.finalUrl).toBe('https://example.com/ch/1');
  });

  it('识别 Cloudflare 挑战页返回 challenge meta', async () => {
    const page = mockPage(
      '<html><body><div id="cf-chl-container">challenge-platform</div></body></html>',
      'https://example.com/',
    );
    (puppeteer.launch as jest.Mock).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    });

    const result = await service.render('https://example.com/');
    expect(result.meta).toBe('challenge');
  });

  it('识别登录页返回 login_required meta', async () => {
    const page = mockPage(
      '<html><body>请先登录后阅读</body></html>',
      'https://example.com/',
    );
    (puppeteer.launch as jest.Mock).mockResolvedValue({
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    });

    const result = await service.render('https://example.com/');
    expect(result.meta).toBe('login_required');
  });

  it('SSRF 守门拒绝内网地址', async () => {
    await expect(service.render('http://127.0.0.1/')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('渲染失败抛出 BadRequestException', async () => {
    (puppeteer.launch as jest.Mock).mockRejectedValue(
      new Error('browser launch failed'),
    );
    await expect(service.render('https://example.com/')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
