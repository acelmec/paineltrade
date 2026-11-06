module.exports = {
  apps: [
    {
      name: 'vortex-hub',
      script: './server/websocket_hub.cjs',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        PORT: 8080
      }
    }
  ]
};
