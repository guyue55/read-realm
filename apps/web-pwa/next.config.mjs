import withPWAInit from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

const withPWA = withPWAInit({
  dest: process.env.READING_WORLD_PWA_DEST || "public",
  disable:
    process.env.NODE_ENV === "development" ||
    process.env.READING_WORLD_VERIFY_NO_PWA_WRITE === "1",
  register: true,
  skipWaiting: true,
  additionalManifestEntries: [{ url: "/", revision: null }],
  navigateFallback: "/",
  navigateFallbackDenylist: [/^\/api\//],
  runtimeCaching,
  buildExcludes: [/app-build-manifest\.json$/, /middleware-manifest\.json$/],
});

const isExportMode = process.env.EXPORT_MODE === "true";

const nextConfig = {
  output: isExportMode ? "export" : undefined,
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
