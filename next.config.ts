import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["qt4oh-studio.liys.online"],
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // 以下包只在 Node.js 运行时使用，不打包进客户端
  // knex 会按需 require 方言驱动（mysql/pg/better-sqlite3），必须保持为外部包
  serverExternalPackages: [
    "unzipper",
    "knex",
    "better-sqlite3",
    "mysql2",
    "pg",
    "undici",
  ],
};

export default nextConfig;
