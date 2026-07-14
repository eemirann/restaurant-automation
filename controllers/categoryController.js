const { sql, connectDB } = require('../config/db');

async function getAllCategories(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query('SELECT * FROM Categories');
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Kategoriler getirilirken hata:', err);
        res.status(500).json({ error: 'Kategoriler getirilemedi'});
    }
}

module.exports = { getAllCategories };