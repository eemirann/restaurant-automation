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

async function getCategoriesById(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM Categories where Id = @id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Kategori bulunamadı'});
        }

        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Kategori getirilirken hata:', err);
        res.status(500).json({ error: 'Kategori getirliemedi' });
    }
}

module.exports = { getAllCategories, getCategoriesById };