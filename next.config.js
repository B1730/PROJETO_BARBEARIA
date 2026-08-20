/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Fotos de corte/barbeiro sobem pro Supabase Storage (ver
    // src/lib/storage.ts) — sem isso, next/image recusa otimizar imagens
    // de um host que não foi liberado explicitamente.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = nextConfig;
