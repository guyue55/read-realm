import withPWAInit from "next-pwa";
import runtimeCaching from "next-pwa/cache.js";

// 自定义霞鹜文楷 CDN 字体的超长缓存规则 (CacheFirst 30 天)
const lxgwFontCacheRule = {
  urlPattern: /^https:\/\/(?:npm\.elemecdn\.com|cdn\.jsdelivr\.net)\/.*lxgw-wenkai.*woff2?$/i,
  handler: "CacheFirst",
  options: {
    cacheName: "lxgw-wenkai-fonts",
    expiration: {
      maxEntries: 16,
      maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
    },
    cacheableResponse: {
      statuses: [0, 200],
    },
  },
};

// 动态修改默认的 Workbox 缓存列表，扩大字体缓存容量防止中文字重分片包排挤退出
const customizedCaching = [
  lxgwFontCacheRule,
  ...runtimeCaching.map((rule) => {
    if (rule.options && rule.options.cacheName === "static-font-assets") {
      return {
        ...rule,
        handler: "CacheFirst", // 强制 CacheFirst 确保离线完美渲染
        options: {
          ...rule.options,
          expiration: {
            maxEntries: 32, // 原为 4，大幅扩容至 32 以容纳各种中文字型分片
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      };
    }
    return rule;
  }),
];

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: customizedCaching,
});

const nextConfig = {
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
  async redirects() {
    return [
      {
        source: "/",
        destination: "/library",
        permanent: false,
      },
    ];
  },
};

export default withPWA(nextConfig);
