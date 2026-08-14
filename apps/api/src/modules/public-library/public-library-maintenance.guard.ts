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
