module.exports = {
  apps: [
    {
      name: 'ajedrez-online',
      script: './server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
