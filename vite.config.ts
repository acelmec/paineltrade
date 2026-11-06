import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

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
  plugins: [lightweightChartsSafetyPlugin(), react()],
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api/ml': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    },
    watch: {
      ignored: ['**/android/**', '**/dist/**']
    }
  }
})
