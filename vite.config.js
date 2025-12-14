import { resolve } from 'path';

export default {
  server: {
    port: 8001
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html')
      }
    }
  },
  resolve: {
    alias: {
      stream: 'stream-browserify',
      buffer: 'buffer',
      util: 'util',
      crypto: 'crypto-browserify',
      https: 'https-browserify',
      http: 'stream-http',
      url: 'url',
      assert: 'assert',
      events: 'events',
      path: 'path-browserify',
      zlib: 'browserify-zlib',
      vm: 'vm-browserify'
    }
  },
  define: {
    'process.env': {},
    'process.version': JSON.stringify('v18.0.0'),
    global: 'globalThis'
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: 'globalThis'
      }
    }
  }
};
