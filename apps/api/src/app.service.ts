import { Injectable } from '@nestjs/common';
import { AppErrorCode } from '@reader/shared-types';

@Injectable()
export class AppService {
  getHello(): string {
    const error: AppErrorCode = 'FILE_TOO_LARGE';
    return `API Status: OK (Test Error Type: ${error})`;
  }
}
