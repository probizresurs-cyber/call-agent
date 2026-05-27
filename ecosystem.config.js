// PM2 ecosystem для call-agent
// Запуск:   pm2 start ecosystem.config.js
// Перезапуск после деплоя:  pm2 restart call-agent call-agent-worker

module.exports = {
  apps: [
    {
      name: "call-agent",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3030",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3030",
      },
      max_memory_restart: "600M",
      out_file: "./logs/web-out.log",
      error_file: "./logs/web-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "call-agent-worker",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/worker.ts",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "400M",
      out_file: "./logs/worker-out.log",
      error_file: "./logs/worker-err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
