import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolvePublicLibraryMaintenanceRoots,
  type PublicLibraryMaintenanceIsolation,
} from './public-library-maintenance-roots';
import { PublicLibraryMaintenanceRootRegistry } from './public-library-maintenance-root-registry';

describe('public library maintenance roots', () => {
  let root: string;
  let isolation: PublicLibraryMaintenanceIsolation;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'public-library-roots-'));
    await Promise.all(
      ['personal-blobs', 'public-blobs', 'maintenance-a', 'maintenance-b'].map(
        (name) => mkdir(join(root, name)),
      ),
    );
    await mkdir(join(root, 'maintenance-a', 'nested'));
    await Promise.all([
      writeFile(join(root, 'personal.sqlite'), ''),
      writeFile(join(root, 'public.sqlite'), ''),
    ]);
    isolation = {
      personalDatabasePath: join(root, 'personal.sqlite'),
      publicDatabasePath: join(root, 'public.sqlite'),
      personalBlobPath: join(root, 'personal-blobs'),
      publicBlobPath: join(root, 'public-blobs'),
    };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('resolves an absolute allowlist without exposing physical paths', async () => {
    const resolved = await resolvePublicLibraryMaintenanceRoots(
      JSON.stringify({
        classics: { label: '古籍维护目录', path: join(root, 'maintenance-a') },
      }),
      isolation,
    );
    expect(resolved.roots).toMatchObject([
      { rootId: 'classics', label: '古籍维护目录' },
    ]);
    expect(resolved.publicRoots).toEqual([
      { rootId: 'classics', label: '古籍维护目录' },
    ]);
    expect(JSON.stringify(resolved.publicRoots)).not.toContain(root);
  });

  it('fails closed for relative paths, overlapping roots, and storage aliases', async () => {
    await expect(
      resolvePublicLibraryMaintenanceRoots(
        JSON.stringify({
          leaked: {
            label: join(root, 'maintenance-a'),
            path: join(root, 'maintenance-a'),
          },
        }),
        isolation,
      ),
    ).rejects.toThrow('PUBLIC_LIBRARY_MAINTENANCE_ROOT_LABEL_INVALID');
    await expect(
      resolvePublicLibraryMaintenanceRoots(
        JSON.stringify({
          leaked: {
            label: String.raw`C:\private\books`,
            path: join(root, 'maintenance-a'),
          },
        }),
        isolation,
      ),
    ).rejects.toThrow('PUBLIC_LIBRARY_MAINTENANCE_ROOT_LABEL_INVALID');

    await expect(
      resolvePublicLibraryMaintenanceRoots(
        JSON.stringify({ relative: { label: '错误', path: './books' } }),
        isolation,
      ),
    ).rejects.toThrow('PUBLIC_LIBRARY_MAINTENANCE_ROOT_PATH_INVALID');

    await expect(
      resolvePublicLibraryMaintenanceRoots(
        JSON.stringify({
          parent: { label: '父', path: join(root, 'maintenance-a') },
          child: {
            label: '子',
            path: join(root, 'maintenance-a', 'nested'),
          },
        }),
        isolation,
      ),
    ).rejects.toThrow('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_OVERLAP');

    const alias = join(root, 'maintenance-alias');
    await symlink(join(root, 'public-blobs'), alias);
    await expect(
      resolvePublicLibraryMaintenanceRoots(
        JSON.stringify({ alias: { label: '别名', path: alias } }),
        isolation,
      ),
    ).rejects.toThrow('PUBLIC_LIBRARY_MAINTENANCE_ROOT_STORAGE_OVERLAP');
  });

  it('treats an absent configuration as an empty maintenance surface', async () => {
    await expect(
      resolvePublicLibraryMaintenanceRoots(undefined, isolation),
    ).resolves.toEqual({ roots: [], publicRoots: [] });
  });

  it('revalidates physical storage aliases before every scan', async () => {
    const blobAlias = join(root, 'public-blob-current');
    await symlink(join(root, 'public-blobs'), blobAlias);
    const dynamicIsolation = { ...isolation, publicBlobPath: blobAlias };
    const raw = JSON.stringify({
      classics: { label: '古籍维护目录', path: join(root, 'maintenance-a') },
    });
    const initial = await resolvePublicLibraryMaintenanceRoots(
      raw,
      dynamicIsolation,
    );
    const registry = new PublicLibraryMaintenanceRootRegistry(
      initial.roots,
      undefined,
      async () =>
        (await resolvePublicLibraryMaintenanceRoots(raw, dynamicIsolation))
          .roots,
    );
    await expect(registry.getForScan('classics')).resolves.toMatchObject({
      rootId: 'classics',
    });

    await rm(blobAlias);
    await symlink(join(root, 'maintenance-a'), blobAlias);
    await expect(registry.getForScan('classics')).rejects.toMatchObject({
      status: 503,
    });
  });

  it('loads configuration from auto-detected JSON file in base directory', async () => {
    const dataDir = join(root, 'data');
    await mkdir(dataDir);
    const configFile = join(dataDir, 'public-library-roots.json');
    await writeFile(
      configFile,
      JSON.stringify({
        my_novels: { label: '本地小说', path: join(root, 'maintenance-a') },
      }),
    );

    const resolved = await resolvePublicLibraryMaintenanceRoots(
      undefined,
      isolation,
      undefined,
      root,
    );
    expect(resolved.roots).toMatchObject([
      { rootId: 'my_novels', label: '本地小说' },
    ]);
  });

  it('loads configuration from explicitly specified JSON file path', async () => {
    const customConfig = join(root, 'custom-roots.json');
    await writeFile(
      customConfig,
      JSON.stringify({
        custom_root: { label: '自定义目录', path: join(root, 'maintenance-b') },
      }),
    );

    const resolved = await resolvePublicLibraryMaintenanceRoots(
      undefined,
      isolation,
      'custom-roots.json',
      root,
    );
    expect(resolved.roots).toMatchObject([
      { rootId: 'custom_root', label: '自定义目录' },
    ]);
  });

  it('loads configuration when raw string is a json file path', async () => {
    const customConfig = join(root, 'roots-via-raw.json');
    await writeFile(
      customConfig,
      JSON.stringify({
        raw_file_root: { label: '路径引用', path: join(root, 'maintenance-a') },
      }),
    );

    const resolved = await resolvePublicLibraryMaintenanceRoots(
      'roots-via-raw.json',
      isolation,
      undefined,
      root,
    );
    expect(resolved.roots).toMatchObject([
      { rootId: 'raw_file_root', label: '路径引用' },
    ]);
  });

  it('rejects config file if it exceeds size limit or is a symlink', async () => {
    const oversizedFile = join(root, 'huge.json');
    // 超过 1MB
    await writeFile(oversizedFile, ' '.repeat(1024 * 1024 + 10));
    await expect(
      resolvePublicLibraryMaintenanceRoots(
        undefined,
        isolation,
        'huge.json',
        root,
      ),
    ).rejects.toThrow('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_INVALID');

    const realConfigFile = join(root, 'real-config.json');
    await writeFile(
      realConfigFile,
      JSON.stringify({
        symlink_root: { label: '软链', path: join(root, 'maintenance-a') },
      }),
    );
    const symlinkConfigFile = join(root, 'symlink-config.json');
    await symlink(realConfigFile, symlinkConfigFile);

    await expect(
      resolvePublicLibraryMaintenanceRoots(
        undefined,
        isolation,
        'symlink-config.json',
        root,
      ),
    ).rejects.toThrow('PUBLIC_LIBRARY_MAINTENANCE_ROOTS_INVALID');
  });
});
