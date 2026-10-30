/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Reine Web-Variante der Oberfläche (ohne Dateizugriff) und Testkonfiguration.
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
