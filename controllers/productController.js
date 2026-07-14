const { sql, connectDB } = require('../config/db');

async function getAllProducts(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request().query('SELECT * FROM Products');
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Ürünler getirilirken hata:', err);
        res.status(500).json({ error: 'Ürünler getirilemedi' });
    }
}

module.exports = { getAllProducts };