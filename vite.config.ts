/// <reference types="vitest/config" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Reine Web-Variante der Oberfläche (ohne Dateizugriff) und Testkonfiguration.
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Auch die Tests des Hauptprozesses (src/main) – sie wählen selbst die Node-Umgebung.
    dir: resolve(import.meta.dirname, 'src'),
  },
})
