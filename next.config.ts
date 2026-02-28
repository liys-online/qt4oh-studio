import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "500mb",
    },
  },
  // unzipper 及其可选依赖（@aws-sdk/client-s3 等）只在 Node.js 运行时使用，不打包进客户端
  serverExternalPackages: ["unzipper"],
};

export default nextConfig;
