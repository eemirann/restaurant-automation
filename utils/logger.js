const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

// ============================================================
// Teknik/hata günlüğü — mevcut controller'lardaki dağınık console.error
// çağrılarının YERİNE geçmez (bkz. görev spesifikasyonu); sadece
// middleware/errorHandler.js'deki YAKALANMAYAN hatalar ve server.js'deki
// process-level uncaughtException/unhandledRejection buraya düşer.
// Dosyalar logs/error-YYYY-MM-DD.log olarak günlük döndürülür, 14 gün
// saklanır (GET /api/logs/recent bu dosyaları okur, bkz. controllers/
// logsController.js).
// ============================================================
const LOG_DIR = path.join(__dirname, '..', 'logs');

const fileTransport = new winston.transports.DailyRotateFile({
    dirname: LOG_DIR,
    filename: 'error-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    maxFiles: '14d',
    level: 'error',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
});

const logger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                    return `${timestamp} [${level}] ${message}${metaStr}`;
                })
            ),
        }),
        fileTransport,
    ],
});

module.exports = logger;
module.exports.LOG_DIR = LOG_DIR;
