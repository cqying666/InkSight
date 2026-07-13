/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生产环境移除 console.*（保留 console.error）
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error"] }
        : false,
  },
  // better-sqlite3 是 native 模块，不打包进 bundle
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    // barrel index 优化，避免全量打包
    optimizePackageImports: ["@/lib/material", "@/lib/trend"],
  },
  webpack: (config, { isServer }) => {
    // 客户端 bundle 中，better-sqlite3 / fs / path 不可用
    // （DB 仅服务端使用，但 import 链可能经 trend/mock-collector → classifier →
    //   llm/client → ai/models → db 间接到达客户端 async chunk）
    // 别名为 false 后，webpack 输出空模块；运行时这些路径仅在服务端执行，安全。
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        fs: false,
        path: false,
        os: false,
      };
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        "better-sqlite3": false,
      };
    }
    return config;
  },
};

export default nextConfig;
