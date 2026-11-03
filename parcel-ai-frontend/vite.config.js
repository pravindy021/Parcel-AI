import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  const apiBaseUrl = (process.env.VITE_API_BASE_URL ?? '').trim()
  const usesLocalApi = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::\d+)?(?:\/|$)/i.test(apiBaseUrl)
  if (mode === 'production' && usesLocalApi) {
    throw new Error('VITE_API_BASE_URL must not use a loopback address in production. Configure the deployed API origin or leave it blank for same-origin.')
  }

  return {
    envDir: mode === 'production' ? false : undefined,
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
      clearMocks: true,
      restoreMocks: true,
    },
  }
})
