import withPWAInit from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

// GitHub Pages 项目站 basePath 开关：默认空字符串＝根域，行为完全不变；
// 设为 /read-realm 时 Next 的 basePath/assetPrefix 与前端 NEXT_PUBLIC_BASE_PATH 同时生效。
// next-pwa 会从 config.basePath 自动推导 SW scope / _sw / precache 前缀，无需单独配置。
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const basePath = rawBasePath
  ? `/${rawBasePath.replace(/^\/+|\/+$/g, "")}`
  : "";

const withPWA = withPWAInit({
  dest: process.env.READING_WORLD_PWA_DEST || "public",
  disable:
    process.env.NODE_ENV === "development" ||
    process.env.READING_WORLD_VERIFY_NO_PWA_WRITE === "1",
  register: true,
  skipWaiting: true,
  // 与 basePath 联动：precache 的起始条目须指向本站子路径，避免误缓存根域。
  additionalManifestEntries: [{ url: basePath || "/", revision: null }],
  // 项目用 hash 路由，所有业务路由都在 # 后，根域/项目站只需入口页。
  navigateFallback: basePath || "/",
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching,
  buildExcludes: [/app-build-manifest\.json$/, /middleware-manifest\.json$/],
});

const isExportMode = process.env.EXPORT_MODE === "true";

const nextConfig = {
  output: isExportMode ? "export" : undefined,
  // 项目站部署到子路径时由 Next 的 basePath 自动给 /_next/* 资源与路由加前缀
  // （assetPrefix 留空时 Next 会自动取 basePath，无需重复配置）；
  // 根域模式保持 undefined，产物与历史完全一致。
  ...(basePath ? { basePath } : {}),
  // Next 15 dev 模式：局域网其他设备访问 /_next/* 资源会被拦截，
  // 由一键启动脚本（scripts/start-app.sh）在局域网模式设 READING_WORLD_LAN=1 时放行；
  // 生产 next start 不受此限制。默认保持收紧（不放行），控制边界。
  ...(process.env.READING_WORLD_LAN === "1"
    ? { allowedDevOrigins: ["*"] }
    : {}),
  devIndicators:
    process.env.READING_WORLD_DISABLE_DEV_INDICATORS === "1"
      ? false
      : undefined,
  images: {
    unoptimized: isExportMode ? true : undefined,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default withPWA(nextConfig);
