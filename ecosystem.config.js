module.exports = {
  apps: [{
    name: 'stori-whatsapp',
    script: 'index.js',
    cwd: '/root/Stori-WhatsPlatform',

    // Entorno
    env: {
      NODE_ENV: 'production'
    },

    // Reinicio automático diario a las 4am para limpiar memoria
    cron_restart: '0 4 * * *',

    // Reiniciar si usa más de 1GB de memoria
    max_memory_restart: '1G',

    // Auto-restart si crashea
    autorestart: true,

    // Esperar 5 segundos entre reinicios
    restart_delay: 5000,

    // Máximo 10 reinicios en 15 minutos antes de parar
    max_restarts: 10,
    min_uptime: '60s',

    // Watch desactivado (usamos nodemon solo en dev)
    watch: false,

    // Logs
    error_file: '/root/Stori-WhatsPlatform/logs/pm2-error.log',
    out_file: '/root/Stori-WhatsPlatform/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,

    // Mantener solo últimos 30 días de logs
    log_rotate: true,

    // Número de instancias (1 para WhatsApp)
    instances: 1,
    exec_mode: 'fork',

    // Graceful shutdown
    kill_timeout: 10000,
    wait_ready: true,
    listen_timeout: 30000
  }]
};
