import * as jschardet from 'jschardet';
import { AppErrorCodeSchema } from '@reader/shared-types';

export function detectAndDecode(buffer: ArrayBuffer): string {
  try {
    const uint8Array = new Uint8Array(buffer);
    // Sample first 8KB to avoid freezing on huge files
    const sampleSize = Math.min(uint8Array.length, 8192);
    const sampleString = String.fromCharCode.apply(null, Array.from(uint8Array.slice(0, sampleSize)));
    
    const detected = jschardet.detect(sampleString);
    let encoding = detected.encoding || 'utf-8';
    
    // Normalize encoding names for TextDecoder
    if (encoding.toLowerCase().replace(/[^a-z0-9]/g, '') === 'gb2312') {
        encoding = 'gbk'; // Use gbk to cover more characters
    }

    const decoder = new TextDecoder(encoding);
    return decoder.decode(buffer);
  } catch (error) {
    throw new Error(AppErrorCodeSchema.parse('ENCODING_DETECT_FAILED'));
  }
}