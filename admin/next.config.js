/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Фиксит проблему с monorepo - указывает корень для трассировки файлов
  outputFileTracingRoot: __dirname,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  },
}

module.exports = nextConfig
