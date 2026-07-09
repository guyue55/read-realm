jest.mock('@reader/parser-core/html', () => ({
  parseWebPageWithReadability: jest.fn(() => ({
    title: '',
    textContent: '',
    contentHtml: '',
  })),
}));

import { BadRequestException } from '@nestjs/common';
import { UrlImportService } from './url-import.service';

describe('UrlImportService (SSRF 守门)', () => {
  const service = new UrlImportService();

  const reject = async (url: string) => {
    await expect(service.parse(url)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  };

  it('拒绝 file:// 与裸文本协议', async () => {
    await reject('file:///etc/passwd');
    await reject('not a url');
  });

  it('拒绝 IPv4 内网、回环与链路本地地址', async () => {
    await reject('http://127.0.0.1/');
    await reject('http://10.0.0.1/');
    await reject('http://192.168.0.1/');
    await reject('http://172.16.5.4/');
    await reject('http://169.254.169.254/latest/meta-data/');
    await reject('http://localhost/');
    await reject('http://0.0.0.0/');
  });

  it('拒绝 IPv6 回环与 ULA/Link-local', async () => {
    await reject('http://[::1]/');
    await reject('http://[fe80::1]/');
    await reject('http://[fd00::1]/');
    await reject('http://[::ffff:127.0.0.1]/');
  });

  it('拒绝 .local / .internal 内网域', async () => {
    await reject('http://router.local/');
    await reject('http://payments.internal/');
  });
});
