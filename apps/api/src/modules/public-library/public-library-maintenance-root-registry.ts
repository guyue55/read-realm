import { ServiceUnavailableException } from '@nestjs/common';
import type {
  PublicLibraryMaintenanceRoot,
  PublicLibraryMaintenanceRootSummary,
} from './public-library-maintenance-roots';

export class PublicLibraryMaintenanceRootRegistry {
  private readonly rootsById: Map<string, PublicLibraryMaintenanceRoot>;

  constructor(
    roots: PublicLibraryMaintenanceRoot[],
    private readonly configurationError?: string,
    private readonly revalidate?: () => Promise<PublicLibraryMaintenanceRoot[]>,
  ) {
    this.rootsById = new Map(roots.map((root) => [root.rootId, root]));
  }

  private assertAvailable() {
    if (this.configurationError) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_LIBRARY_MAINTENANCE_ROOTS_UNAVAILABLE',
        message: '服务端维护目录配置不可用，请检查实例配置',
      });
    }
  }

  list(): PublicLibraryMaintenanceRootSummary[] {
    this.assertAvailable();
    return [...this.rootsById.values()].map(({ rootId, label }) => ({
      rootId,
      label,
    }));
  }

  get(rootId: string) {
    this.assertAvailable();
    return this.rootsById.get(rootId);
  }

  async getForScan(rootId: string) {
    this.assertAvailable();
    const configuredRoot = this.rootsById.get(rootId);
    if (!configuredRoot || !this.revalidate) return configuredRoot;
    let currentRoots: PublicLibraryMaintenanceRoot[];
    try {
      currentRoots = await this.revalidate();
    } catch {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_LIBRARY_MAINTENANCE_ROOTS_UNAVAILABLE',
        message: '服务端维护目录物理隔离已变化，请检查实例配置',
      });
    }
    const currentById = new Map(
      currentRoots.map((root) => [root.rootId, root]),
    );
    if (
      currentById.size !== this.rootsById.size ||
      [...this.rootsById].some(
        ([id, original]) =>
          currentById.get(id)?.configFingerprint !== original.configFingerprint,
      )
    ) {
      throw new ServiceUnavailableException({
        code: 'PUBLIC_LIBRARY_MAINTENANCE_ROOTS_CHANGED',
        message: '服务端维护目录配置已变化，请重启实例后再扫描',
      });
    }
    return currentById.get(rootId);
  }
}
