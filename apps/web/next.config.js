/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@wallstreetsim/types'],
  experimental: {
    optimizePackageImports: ['@wallstreetsim/types'],
  },
};

module.exports = nextConfig;
