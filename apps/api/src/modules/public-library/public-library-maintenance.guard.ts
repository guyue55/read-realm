import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { PublicLibraryService } from './public-library.service';

@Injectable()
export class PublicLibraryMaintenanceGuard implements CanActivate {
  constructor(private readonly service: PublicLibraryService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const rawKey = request.headers['x-public-library-maintenance-key'];
    this.service.assertMaintenanceKey(
      typeof rawKey === 'string' ? rawKey : undefined,
    );
    return true;
  }
}

/**
 * 与 PublicLibraryMaintenanceGuard 相同，但 allowAny 模式下（READER_PUBLIC_LIBRARY_MAINTENANCE_ALLOW_ANY=1）跳过凭据校验。
 * 仅用于「入阁上传」路由（maintenance/files），其余维护写操作（catalog 修改、个人快照等）始终使用严格版。
 */
@Injectable()
export class PublicLibraryMaintenanceAllowAnyGuard implements CanActivate {
  constructor(private readonly service: PublicLibraryService) {}

  canActivate(context: ExecutionContext) {
    if (this.service.isAllowAnyMaintenance()) return true;
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const rawKey = request.headers['x-public-library-maintenance-key'];
    this.service.assertMaintenanceKey(
      typeof rawKey === 'string' ? rawKey : undefined,
    );
    return true;
  }
}
