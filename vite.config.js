export default {
  server: {
    port: 8001
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
      events: 'events'
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
