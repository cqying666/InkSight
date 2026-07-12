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
};

export default nextConfig;
