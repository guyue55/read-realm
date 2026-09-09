import { BadRequestException } from '@nestjs/common';
import { fetchPublicHtml, assertPublicUrl } from './public-url.guard';

jest.mock('dns/promises', () => ({
  lookup: jest.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
  ),
}));

describe('public-url.guard (SSRF 守门 + 静态抓取)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('assertPublicUrl 接受公网域名', async () => {
    await expect(assertPublicUrl('https://example.com/')).resolves.toBe(
      'https://example.com/',
    );
  });

  it('assertPublicUrl 拒绝内网 host', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      assertPublicUrl('http://router.local/'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fetchPublicHtml 正常抓取返回 HTML', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response('<html><body><p>正文内容</p></body></html>', {
        status: 200,
        headers: { 'content-length': '100' },
      }),
    );

    const result = await fetchPublicHtml('https://example.com/');
    expect(result.html).toContain('正文内容');
    expect(result.finalUrl).toBe('https://example.com/');
  });

  it('fetchPublicHtml 跟随重定向并重过守门', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/redirected' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('<html><body>重定向后正文</body></html>', {
          status: 200,
          headers: { 'content-length': '100' },
        }),
      );

    const result = await fetchPublicHtml('https://example.com/start');
    expect(result.html).toContain('重定向后正文');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('fetchPublicHtml 超过大小上限拒绝', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response('<html>' + 'x'.repeat(10 * 1024 * 1024) + '</html>', {
        status: 200,
        headers: { 'content-length': String(10 * 1024 * 1024 + 1) },
      }),
    );

    await expect(
      fetchPublicHtml('https://example.com/'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fetchPublicHtml 反爬页面拒绝', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(
      new Response('<html><body>验证码</body></html>', {
        status: 200,
        headers: { 'content-length': '50' },
      }),
    );

    await expect(
      fetchPublicHtml('https://example.com/'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
