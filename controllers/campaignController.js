const { sql, connectDB } = require('../config/db');
const { HttpError } = require('../utils/httpError');
const { logAudit } = require('../utils/audit');

const CAMPAIGN_TYPES = ['Info', 'Combo'];

// ============================================================
// KAMPANYA / COMBO YÖNETİMİ (SADECE ADMIN)
//
// CampaignType='Combo' olan bir kampanya bir ComboOffer'a bağlıdır
// (Campaigns.ComboOfferId). Combo'nun kendisi (Name/Price/Items) bu
// controller üzerinden, kampanyayla BİRLİKTE (embedded `Combo` alanı)
// oluşturulur/güncellenir — ayrı bir ComboOffers CRUD ekranı yok,
// combo'lar her zaman bir kampanyanın parçası olarak yönetiliyor.
// CampaignType='Info' olanlarda Combo hiç gönderilmez/kullanılmaz.
// ============================================================

async function validateComboItems(request, items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new HttpError(400, 'Combo en az bir ürün içermelidir');
    }
    for (const item of items) {
        if (typeof item.ProductId !== 'number' || !Number.isInteger(item.Quantity) || item.Quantity <= 0) {
            throw new HttpError(400, 'Her combo bileşeni için geçerli ProductId ve pozitif tam sayı Quantity giriniz');
        }
    }
}

function mapCampaignRow(row) {
    return {
        ...row,
        IsActive: Boolean(row.IsActive),
    };
}

// ============================================================
// GET /api/campaigns — tüm kampanyalar (Admin paneli listesi)
// ============================================================
async function getAllCampaigns(req, res) {
    try {
        const pool = await connectDB();
        const campaignsResult = await pool.request().query(`
            SELECT c.*, co.Name AS ComboName, co.Price AS ComboPrice
            FROM Campaigns c
            LEFT JOIN ComboOffers co ON co.ComboOfferId = c.ComboOfferId
            ORDER BY c.DisplayOrder ASC, c.CampaignId DESC
        `);

        const campaigns = campaignsResult.recordset.map(mapCampaignRow);
        const comboIds = campaigns.filter((c) => c.ComboOfferId).map((c) => c.ComboOfferId);

        let itemsByComboId = new Map();
        if (comboIds.length > 0) {
            const itemsResult = await pool.request().query(`
                SELECT ci.ComboOfferId, ci.ProductId, p.Name AS ProductName, ci.Quantity
                FROM ComboOfferItems ci
                JOIN Products p ON p.ProductId = ci.ProductId
                WHERE ci.ComboOfferId IN (${comboIds.join(',')})
            `);
            itemsByComboId = new Map();
            for (const row of itemsResult.recordset) {
                if (!itemsByComboId.has(row.ComboOfferId)) itemsByComboId.set(row.ComboOfferId, []);
                itemsByComboId.get(row.ComboOfferId).push(row);
            }
        }

        res.status(200).json(campaigns.map((c) => ({
            ...c,
            ComboItems: c.ComboOfferId ? (itemsByComboId.get(c.ComboOfferId) || []) : [],
        })));
    } catch (err) {
        console.error('Kampanyalar getirilirken hata:', err);
        res.status(500).json({ error: 'Kampanyalar getirilemedi' });
    }
}

// ============================================================
// POST /api/campaigns — yeni kampanya oluştur
// Body: { Title, Description?, StartAt, EndAt, DisplayOrder?, CampaignType,
//         Combo?: { Name, Price, Items: [{ProductId, Quantity}] } }
// ============================================================
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function validateRecurringDailyTimes(RecurringDailyStartTime, RecurringDailyEndTime) {
    const hasStart = RecurringDailyStartTime !== undefined && RecurringDailyStartTime !== null && RecurringDailyStartTime !== '';
    const hasEnd = RecurringDailyEndTime !== undefined && RecurringDailyEndTime !== null && RecurringDailyEndTime !== '';
    if (!hasStart && !hasEnd) return null;
    if (hasStart !== hasEnd) {
        throw new HttpError(400, 'RecurringDailyStartTime ve RecurringDailyEndTime birlikte gönderilmeli veya ikisi de boş bırakılmalıdır');
    }
    if (!TIME_RE.test(RecurringDailyStartTime) || !TIME_RE.test(RecurringDailyEndTime)) {
        return { error: 'RecurringDailyStartTime/RecurringDailyEndTime HH:MM (24 saat) biçiminde olmalıdır' };
    }
    return { RecurringDailyStartTime, RecurringDailyEndTime };
}

async function createCampaign(req, res) {
    const { Title, Description, StartAt, EndAt, DisplayOrder, CampaignType, Combo, RecurringDailyStartTime, RecurringDailyEndTime } = req.body;

    if (!Title || typeof Title !== 'string' || !Title.trim()) {
        return res.status(400).json({ error: 'Başlık zorunludur' });
    }
    if (!StartAt || !EndAt || isNaN(Date.parse(StartAt)) || isNaN(Date.parse(EndAt))) {
        return res.status(400).json({ error: 'Geçerli bir StartAt/EndAt zorunludur' });
    }
    if (new Date(EndAt) <= new Date(StartAt)) {
        return res.status(400).json({ error: 'EndAt, StartAt\'tan sonra olmalıdır' });
    }
    if (!CAMPAIGN_TYPES.includes(CampaignType)) {
        return res.status(400).json({ error: `CampaignType şunlardan biri olmalı: ${CAMPAIGN_TYPES.join(', ')}` });
    }
    if (CampaignType === 'Combo') {
        if (!Combo || typeof Combo.Name !== 'string' || !Combo.Name.trim() || typeof Combo.Price !== 'number' || Combo.Price <= 0) {
            return res.status(400).json({ error: 'Combo tipi için geçerli bir Combo{Name, Price, Items} gönderilmelidir' });
        }
    }

    let recurringDaily;
    try {
        recurringDaily = validateRecurringDailyTimes(RecurringDailyStartTime, RecurringDailyEndTime);
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.statusCode).json({ error: err.message });
        throw err;
    }
    if (recurringDaily?.error) {
        return res.status(400).json({ error: recurringDaily.error });
    }

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        let comboOfferId = null;
        if (CampaignType === 'Combo') {
            await validateComboItems(transaction, Combo.Items);

            const comboResult = await new sql.Request(transaction)
                .input('Name', sql.NVarChar(150), Combo.Name.trim())
                .input('Price', sql.Decimal(10, 2), Combo.Price)
                .query(`INSERT INTO ComboOffers (Name, Price) OUTPUT INSERTED.ComboOfferId VALUES (@Name, @Price)`);
            comboOfferId = comboResult.recordset[0].ComboOfferId;

            for (const item of Combo.Items) {
                await new sql.Request(transaction)
                    .input('ComboOfferId', sql.Int, comboOfferId)
                    .input('ProductId', sql.Int, item.ProductId)
                    .input('Quantity', sql.Int, item.Quantity)
                    .query(`INSERT INTO ComboOfferItems (ComboOfferId, ProductId, Quantity) VALUES (@ComboOfferId, @ProductId, @Quantity)`);
            }
        }

        const result = await new sql.Request(transaction)
            .input('Title', sql.NVarChar(150), Title.trim())
            .input('Description', sql.NVarChar(500), Description?.trim() || null)
            .input('StartAt', sql.DateTime, new Date(StartAt))
            .input('EndAt', sql.DateTime, new Date(EndAt))
            .input('DisplayOrder', sql.Int, Number.isInteger(DisplayOrder) ? DisplayOrder : 0)
            .input('CampaignType', sql.NVarChar(20), CampaignType)
            .input('ComboOfferId', sql.Int, comboOfferId)
            .input('RecurringDailyStartTime', sql.NVarChar(8), recurringDaily?.RecurringDailyStartTime || null)
            .input('RecurringDailyEndTime', sql.NVarChar(8), recurringDaily?.RecurringDailyEndTime || null)
            .query(`
                INSERT INTO Campaigns (Title, Description, StartAt, EndAt, DisplayOrder, CampaignType, ComboOfferId, RecurringDailyStartTime, RecurringDailyEndTime)
                OUTPUT INSERTED.*
                VALUES (@Title, @Description, @StartAt, @EndAt, @DisplayOrder, @CampaignType, @ComboOfferId, @RecurringDailyStartTime, @RecurringDailyEndTime)
            `);

        await transaction.commit();
        logAudit(pool, {
            userId: req.user?.userId, action: 'CAMPAIGN_CREATE', entityType: 'Campaign', entityId: result.recordset[0].CampaignId,
            details: { title: result.recordset[0].Title, campaignType: CampaignType },
        });
        res.status(201).json(mapCampaignRow(result.recordset[0]));
    } catch (err) {
        try { await transaction.rollback(); } catch { /* rollback best-effort */ }
        if (err instanceof HttpError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Kampanya oluşturulurken hata:', err);
        res.status(500).json({ error: 'Kampanya oluşturulamadı' });
    }
}

// ============================================================
// PUT /api/campaigns/:id — kampanyayı güncelle (Combo tipiyse Combo
// bileşenleri de gönderilirse baştan yazılır — ComboOfferItems silinip
// yeniden eklenir, en basit tutarlı yol).
// ============================================================
async function updateCampaign(req, res) {
    const { id } = req.params;
    const { Title, Description, StartAt, EndAt, DisplayOrder, IsActive, CampaignType, Combo, RecurringDailyStartTime, RecurringDailyEndTime } = req.body;

    if (Title !== undefined && (typeof Title !== 'string' || !Title.trim())) {
        return res.status(400).json({ error: 'Başlık boş olamaz' });
    }
    if ((StartAt !== undefined || EndAt !== undefined) && (isNaN(Date.parse(StartAt)) || isNaN(Date.parse(EndAt)))) {
        return res.status(400).json({ error: 'Geçerli bir StartAt/EndAt gönderilmelidir' });
    }
    if (CampaignType !== undefined && !CAMPAIGN_TYPES.includes(CampaignType)) {
        return res.status(400).json({ error: `CampaignType şunlardan biri olmalı: ${CAMPAIGN_TYPES.join(', ')}` });
    }

    let recurringDaily;
    try {
        recurringDaily = validateRecurringDailyTimes(RecurringDailyStartTime, RecurringDailyEndTime);
    } catch (err) {
        if (err instanceof HttpError) return res.status(err.statusCode).json({ error: err.message });
        throw err;
    }
    if (recurringDaily?.error) {
        return res.status(400).json({ error: recurringDaily.error });
    }

    const pool = await connectDB();
    const transaction = new sql.Transaction(pool);

    try {
        await transaction.begin();

        const existingResult = await new sql.Request(transaction)
            .input('Id', sql.Int, id)
            .query(`SELECT * FROM Campaigns WHERE CampaignId = @Id`);
        if (existingResult.recordset.length === 0) {
            await transaction.rollback();
            return res.status(404).json({ error: 'Kampanya bulunamadı' });
        }
        const existing = existingResult.recordset[0];

        let comboOfferId = existing.ComboOfferId;

        if (Combo) {
            await validateComboItems(transaction, Combo.Items);

            if (comboOfferId) {
                await new sql.Request(transaction)
                    .input('ComboOfferId', sql.Int, comboOfferId)
                    .input('Name', sql.NVarChar(150), Combo.Name.trim())
                    .input('Price', sql.Decimal(10, 2), Combo.Price)
                    .query(`UPDATE ComboOffers SET Name = @Name, Price = @Price WHERE ComboOfferId = @ComboOfferId`);
                await new sql.Request(transaction)
                    .input('ComboOfferId', sql.Int, comboOfferId)
                    .query(`DELETE FROM ComboOfferItems WHERE ComboOfferId = @ComboOfferId`);
            } else {
                const comboResult = await new sql.Request(transaction)
                    .input('Name', sql.NVarChar(150), Combo.Name.trim())
                    .input('Price', sql.Decimal(10, 2), Combo.Price)
                    .query(`INSERT INTO ComboOffers (Name, Price) OUTPUT INSERTED.ComboOfferId VALUES (@Name, @Price)`);
                comboOfferId = comboResult.recordset[0].ComboOfferId;
            }

            for (const item of Combo.Items) {
                await new sql.Request(transaction)
                    .input('ComboOfferId', sql.Int, comboOfferId)
                    .input('ProductId', sql.Int, item.ProductId)
                    .input('Quantity', sql.Int, item.Quantity)
                    .query(`INSERT INTO ComboOfferItems (ComboOfferId, ProductId, Quantity) VALUES (@ComboOfferId, @ProductId, @Quantity)`);
            }
        }

        const recurringProvided = RecurringDailyStartTime !== undefined || RecurringDailyEndTime !== undefined;
        const finalRecurringStart = recurringProvided ? (recurringDaily?.RecurringDailyStartTime || null) : existing.RecurringDailyStartTime;
        const finalRecurringEnd = recurringProvided ? (recurringDaily?.RecurringDailyEndTime || null) : existing.RecurringDailyEndTime;

        const result = await new sql.Request(transaction)
            .input('Id', sql.Int, id)
            .input('Title', sql.NVarChar(150), Title !== undefined ? Title.trim() : existing.Title)
            .input('Description', sql.NVarChar(500), Description !== undefined ? (Description?.trim() || null) : existing.Description)
            .input('StartAt', sql.DateTime, StartAt !== undefined ? new Date(StartAt) : existing.StartAt)
            .input('EndAt', sql.DateTime, EndAt !== undefined ? new Date(EndAt) : existing.EndAt)
            .input('DisplayOrder', sql.Int, Number.isInteger(DisplayOrder) ? DisplayOrder : existing.DisplayOrder)
            .input('IsActive', sql.Bit, IsActive !== undefined ? Boolean(IsActive) : existing.IsActive)
            .input('CampaignType', sql.NVarChar(20), CampaignType !== undefined ? CampaignType : existing.CampaignType)
            .input('ComboOfferId', sql.Int, comboOfferId)
            .input('RecurringDailyStartTime', sql.NVarChar(8), finalRecurringStart)
            .input('RecurringDailyEndTime', sql.NVarChar(8), finalRecurringEnd)
            .query(`
                UPDATE Campaigns
                SET Title = @Title, Description = @Description, StartAt = @StartAt, EndAt = @EndAt,
                    DisplayOrder = @DisplayOrder, IsActive = @IsActive, CampaignType = @CampaignType, ComboOfferId = @ComboOfferId,
                    RecurringDailyStartTime = @RecurringDailyStartTime, RecurringDailyEndTime = @RecurringDailyEndTime
                OUTPUT INSERTED.*
                WHERE CampaignId = @Id
            `);

        await transaction.commit();
        if (IsActive !== undefined && Boolean(IsActive) !== Boolean(existing.IsActive)) {
            logAudit(pool, {
                userId: req.user?.userId, action: 'CAMPAIGN_ACTIVITY_CHANGE', entityType: 'Campaign', entityId: Number(id),
                details: { title: existing.Title, isActive: Boolean(IsActive) },
            });
        }
        res.status(200).json(mapCampaignRow(result.recordset[0]));
    } catch (err) {
        try { await transaction.rollback(); } catch { /* rollback best-effort */ }
        if (err instanceof HttpError) {
            return res.status(err.statusCode).json({ error: err.message });
        }
        console.error('Kampanya güncellenirken hata:', err);
        res.status(500).json({ error: 'Kampanya güncellenemedi' });
    }
}

// ============================================================
// DELETE /api/campaigns/:id — soft-delete (IsActive=0), Categories/Extras
// ile aynı desen. Combo/ComboOfferItems'a dokunulmaz (geçmiş sipariş
// kayıtları OrderDetails.ComboOfferId üzerinden hâlâ bu combo'ya işaret
// edebilir).
// ============================================================
async function deleteCampaign(req, res) {
    try {
        const pool = await connectDB();
        const result = await pool.request()
            .input('Id', sql.Int, req.params.id)
            .query(`UPDATE Campaigns SET IsActive = 0 OUTPUT INSERTED.* WHERE CampaignId = @Id`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Kampanya bulunamadı' });
        }

        logAudit(pool, {
            userId: req.user?.userId, action: 'CAMPAIGN_DELETE', entityType: 'Campaign', entityId: Number(req.params.id),
            details: { title: result.recordset[0].Title },
        });

        res.status(200).json(mapCampaignRow(result.recordset[0]));
    } catch (err) {
        console.error('Kampanya silinirken hata:', err);
        res.status(500).json({ error: 'Kampanya silinemedi' });
    }
}

// ============================================================
// POST /api/campaigns/:id/image — kampanya görseli yükle. AYNI upload
// middleware'i (middleware/upload.js, uploads/products/ altına kaydeder)
// ürün resimleriyle paylaşılıyor — yeni bir upload mekanizması yok.
// ============================================================
async function uploadCampaignImage(req, res) {
    const { id } = req.params;

    if (!req.file) {
        return res.status(400).json({ error: 'Resim dosyası gerekli' });
    }

    try {
        const pool = await connectDB();
        const imageUrl = `/uploads/products/${req.file.filename}`;

        const result = await pool.request()
            .input('Id', sql.Int, id)
            .input('ImageUrl', sql.NVarChar(255), imageUrl)
            .query(`UPDATE Campaigns SET ImageUrl = @ImageUrl OUTPUT INSERTED.* WHERE CampaignId = @Id`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Kampanya bulunamadı' });
        }
        res.status(200).json(mapCampaignRow(result.recordset[0]));
    } catch (err) {
        console.error('Kampanya görseli yüklenirken hata:', err);
        res.status(500).json({ error: 'Kampanya görseli yüklenemedi' });
    }
}

module.exports = { getAllCampaigns, createCampaign, updateCampaign, deleteCampaign, uploadCampaignImage };
