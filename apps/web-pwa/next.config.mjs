import withPWAInit from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

const withPWA = withPWAInit({
  dest: "public",
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
