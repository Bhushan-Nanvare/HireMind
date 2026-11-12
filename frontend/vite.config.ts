import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 0.0.0.0 so the port is reachable from outside the container
    host: true,
    port: 5173,
    strictPort: true,
    // Docker Desktop does not emit file events for bind mounts
    watch: { usePolling: true, interval: 300 },
  },
})
