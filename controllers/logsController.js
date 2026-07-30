const fs = require('fs');
const path = require('path');
const { LOG_DIR } = require('../utils/logger');

// ============================================================
// GET /api/logs/recent — son N teknik hata satırını döner (SADECE ADMIN).
// utils/logger.js'nin yazdığı logs/error-YYYY-MM-DD.log dosyalarını
// (en yeni tarihten geriye doğru) okuyup JSON satırlarını ayrıştırır.
// ============================================================
async function getRecentLogs(req, res) {
    try {
        const limit = Math.min(Number(req.query.limit) || 100, 500);

        if (!fs.existsSync(LOG_DIR)) {
            return res.status(200).json([]);
        }

        const files = fs.readdirSync(LOG_DIR)
            .filter((f) => f.startsWith('error-') && f.endsWith('.log'))
            .sort()
            .reverse();

        const lines = [];
        for (const file of files) {
            if (lines.length >= limit) break;
            const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
            const fileLines = content.split('\n').filter(Boolean).reverse();
            lines.push(...fileLines);
        }

        const entries = lines.slice(0, limit).map((line) => {
            try {
                return JSON.parse(line);
            } catch {
                return { message: line };
            }
        });

        res.status(200).json(entries);
    } catch (err) {
        console.error('Teknik loglar getirilirken hata:', err);
        res.status(500).json({ error: 'Teknik loglar getirilemedi' });
    }
}

module.exports = { getRecentLogs };
