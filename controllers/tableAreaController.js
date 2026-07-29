const { sql, connectDB } = require('../config/db');

// ============================================================
// MASA BÖLÜMLERİ (Salon/Teras/Bahçe/VIP/Bar vb.) — admin tarafından
// eklenip/çıkarılıp/yeniden adlandırılabilir. Categories/Extras ile
// aynı desen (soft-delete: IsActive).
// ============================================================

async function getAllAreas(req, res) {
    try {
        const { all } = req.query;
        const pool = await connectDB();
        const where = all === '1' ? '' : 'WHERE IsActive = 1';
        const result = await pool.request().query(`SELECT * FROM TableAreas ${where} ORDER BY DisplayOrder ASC, Name ASC`);
        res.status(200).json(result.recordset);
    } catch (err) {
        console.error('Masa bölümleri getirilirken hata:', err);
        res.status(500).json({ error: 'Masa bölümleri getirilemedi' });
    }
}

async function createArea(req, res) {
    try {
        const { Name, DisplayOrder } = req.body;

        if (!Name || typeof Name !== 'string' || !Name.trim()) {
            return res.status(400).json({ error: 'Bölüm adı zorunludur' });
        }
        if (Name.trim().length > 30) {
            return res.status(400).json({ error: 'Bölüm adı en fazla 30 karakter olabilir' });
        }

        const pool = await connectDB();

        const existing = await pool.request()
            .input('Name', sql.NVarChar(30), Name.trim())
            .query(`SELECT AreaId FROM TableAreas WHERE Name = @Name`);
        if (existing.recordset.length > 0) {
            return res.status(409).json({ error: 'Bu isimde bir bölüm zaten var' });
        }

        const result = await pool.request()
            .input('Name', sql.NVarChar(30), Name.trim())
            .input('DisplayOrder', sql.Int, Number.isInteger(DisplayOrder) ? DisplayOrder : 0)
            .query(`INSERT INTO TableAreas (Name, DisplayOrder) OUTPUT INSERTED.* VALUES (@Name, @DisplayOrder)`);

        res.status(201).json(result.recordset[0]);
    } catch (err) {
        console.error('Masa bölümü oluşturulurken hata:', err);
        res.status(500).json({ error: 'Masa bölümü oluşturulamadı' });
    }
}

// Yeniden adlandırma, mevcut Tables.Area değerlerini de aynı transaction'da
// günceller — aksi halde o bölümdeki masalar artık hiçbir aktif bölümle
// eşleşmeyen "yetim" bir isimde kalırdı.
async function updateArea(req, res) {
    try {
        const { id } = req.params;
        const { Name, DisplayOrder, IsActive } = req.body;

        if (Name !== undefined && (typeof Name !== 'string' || !Name.trim() || Name.trim().length > 30)) {
            return res.status(400).json({ error: 'Bölüm adı 1-30 karakter arasında olmalıdır' });
        }

        const pool = await connectDB();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const existing = await new sql.Request(transaction)
                .input('AreaId', sql.Int, id)
                .query(`SELECT * FROM TableAreas WHERE AreaId = @AreaId`);
            if (existing.recordset.length === 0) {
                await transaction.rollback();
                return res.status(404).json({ error: 'Bölüm bulunamadı' });
            }
            const current = existing.recordset[0];

            if (Name !== undefined && Name.trim() !== current.Name) {
                const dup = await new sql.Request(transaction)
                    .input('Name', sql.NVarChar(30), Name.trim())
                    .input('AreaId', sql.Int, id)
                    .query(`SELECT AreaId FROM TableAreas WHERE Name = @Name AND AreaId <> @AreaId`);
                if (dup.recordset.length > 0) {
                    await transaction.rollback();
                    return res.status(409).json({ error: 'Bu isimde bir bölüm zaten var' });
                }

                // Bu bölümdeki tüm masaların Area alanını da yeni isme taşı
                await new sql.Request(transaction)
                    .input('OldName', sql.NVarChar(20), current.Name)
                    .input('NewName', sql.NVarChar(20), Name.trim())
                    .query(`UPDATE Tables SET Area = @NewName WHERE Area = @OldName`);
            }

            const result = await new sql.Request(transaction)
                .input('AreaId', sql.Int, id)
                .input('Name', sql.NVarChar(30), Name !== undefined ? Name.trim() : current.Name)
                .input('DisplayOrder', sql.Int, Number.isInteger(DisplayOrder) ? DisplayOrder : current.DisplayOrder)
                .input('IsActive', sql.Bit, IsActive !== undefined ? Boolean(IsActive) : current.IsActive)
                .query(`
                    UPDATE TableAreas SET Name = @Name, DisplayOrder = @DisplayOrder, IsActive = @IsActive
                    OUTPUT INSERTED.*
                    WHERE AreaId = @AreaId
                `);

            await transaction.commit();
            res.status(200).json(result.recordset[0]);
        } catch (err) {
            await transaction.rollback();
            throw err;
        }
    } catch (err) {
        console.error('Masa bölümü güncellenirken hata:', err);
        res.status(500).json({ error: 'Masa bölümü güncellenemedi' });
    }
}

// Silme = soft-delete (IsActive=0). O bölümdeki mevcut masalar Area
// değerini korur (geçmiş veride kayıp olmasın), sadece yeni masa
// eklerken/düzenlerken artık seçilemez.
async function deleteArea(req, res) {
    try {
        const { id } = req.params;
        const pool = await connectDB();

        const activeCount = await pool.request().query(`SELECT COUNT(*) AS Cnt FROM TableAreas WHERE IsActive = 1`);
        if (activeCount.recordset[0].Cnt <= 1) {
            return res.status(400).json({ error: 'En az bir aktif bölüm kalmalı' });
        }

        const result = await pool.request()
            .input('AreaId', sql.Int, id)
            .query(`UPDATE TableAreas SET IsActive = 0 OUTPUT INSERTED.* WHERE AreaId = @AreaId`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Bölüm bulunamadı' });
        }
        res.status(200).json(result.recordset[0]);
    } catch (err) {
        console.error('Masa bölümü silinirken hata:', err);
        res.status(500).json({ error: 'Masa bölümü silinemedi' });
    }
}

module.exports = { getAllAreas, createArea, updateArea, deleteArea };
