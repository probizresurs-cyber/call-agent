// PM2 ecosystem для staging-инстанса call-agent.
// Запускать из ~/call-agent-staging (отдельная папка-клон, своя БД, свой .env).
//
// Команды:
//   pm2 start ecosystem.staging.config.js
//   pm2 restart call-agent-staging call-agent-staging-worker --update-env
module.exports = {
  apps: [
    {
      name: "call-agent-staging",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3031",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3031",
      },
      max_memory_restart: "600M",
      out_file: "./logs/web-out.log",
      error_file: "./logs/web-err.log",
      merge_logs: true,
      time: true,
    },
    {
      name: "call-agent-staging-worker",
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
