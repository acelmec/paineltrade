import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

function excludePublicVersionsFromDist(): Plugin {
  return {
    name: 'exclude-public-versions-from-dist',
    closeBundle() {
      // Evita inchaço do dist com pastas de releases/versões públicas (V<DDMMAAAA>_NN)
      const distDir = path.resolve(__dirname, 'dist');
      if (fs.existsSync(distDir)) {
        const entries = fs.readdirSync(distDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory() && /^V\d{8}_\d+$/.test(e.name)) {
            try {
              fs.rmSync(path.join(distDir, e.name), { recursive: true, force: true });
            } catch {}
          }
        }
      }
    }
  };
}

function lightweightChartsSafetyPlugin(): Plugin {
  return {
    name: 'lightweight-charts-safety-plugin',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (id.includes('lightweight-charts')) {
        let modified = code;
        if (modified.includes("throw new Error('Value is null');")) {
          modified = modified.replace(
            /throw new Error\('Value is null'\);/g,
            "return value ?? { Wt: [0,0,0,0], R: undefined, Ht: undefined, hh: undefined, _internal_value: [0,0,0,0], _internal_color: undefined, _internal_lineColor: undefined };"
          );
        }
        if (modified.includes('if(null===t)throw new Error("Value is null");return t')) {
          modified = modified.replace(
            /if\(null===t\)throw new Error\("Value is null"\);return t/g,
            "return t ?? { Wt: [0,0,0,0], R: void 0, Ht: void 0, hh: void 0, _internal_value: [0,0,0,0] }"
          );
        }
        return {
          code: modified,
          map: null
        };
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [lightweightChartsSafetyPlugin(), react(), excludePublicVersionsFromDist()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/binance-api': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-api/, ''),
        secure: true
      },
      '/binance-fapi': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-fapi/, ''),
        secure: true
      },
      '/binance-future-testnet': {
        target: 'https://testnet.binancefuture.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-future-testnet/, ''),
        secure: true
      },
      '/binance-spot-testnet': {
        target: 'https://testnet.binance.vision',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-spot-testnet/, ''),
        secure: true
      },
      '/api/ml': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      },
      '/yahoo-api': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-api/, ''),
        secure: true,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      }
    },
    watch: {
      ignored: ['**/android/**', '**/dist/**']
    }
  }
})
