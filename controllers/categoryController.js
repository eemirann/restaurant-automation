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

async function createCategory(req, res) {
    try{
        const{ Name } = req.body;

        if (!Name) {
            return res.status(400).json({error: 'Kategori adı zorunludur'});
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Name', sql.NVarChar, Name)
            .query('INSERT INTO Categories (Name) OUTPUT INSERTED.* VALUES (@Name)');

            res.status(201).json(result.recordset[0]);
        }  catch (err) {
            console.error('Kategori oluşturulurken hata:', err);
            res.status(500).json({ error: 'Kategori oluşturulamadı'});
        }  
    }

async function updateCategory(req, res) {
    try {
        const { id } = req.params;
        const { Name } = req.body;

        if (!Name) {
            return res.status(400).json({ error: 'Kategori adı zorunludur'});
        }

        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('Name', sql.NVarChar, Name)
            .query('UPDATE Categories SET Name = @Name OUTPUT INSERTED.* WHERE Id = @Id');

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Kategori bulunamadı'});

        }
        
        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Kategori güncellenirken hata:', err);
        res.status(500).json({ error: 'Kategori güncellenemedi'});
    }
} 

async function deleteCategory(req, res) {
    try {
        const { id } = req.params;

    const pool = await connectDB();
    const result = await pool.request()
        .input('Id',sql.Int, id)
        .query('UPDATE Categories SET IsActive = 0 OUTPUT INSERTED.* WHERE Id = @Id');

    if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Kategori bulunamadı'});
    }
    
    res.status(200).json(result.recordset[0]);
}  catch (err) {
    console.error('Kategori silinirken hata', err);
    res.status(500).json({error: 'Kategori silinemedi'});
    }

}



    


module.exports = { getAllCategories, getCategoriesById, createCategory, updateCategory, deleteCategory };