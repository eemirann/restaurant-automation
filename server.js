require('dotenv').config({ quiet: true });

// ============================================================
// FAIL-FAST: Kritik env değişkenleri yoksa sunucu HİÇ başlamasın.
// JWT_SECRET olmadan token'lar 'undefined' secret ile imzalanır
// (ciddi güvenlik açığı), bu yüzden erkenden ve gürültülü çökeriz.
// ============================================================
if (!process.env.JWT_SECRET) {
    console.error('HATA: JWT_SECRET tanımlı değil. Sunucu başlatılamıyor. .env dosyanızı kontrol edin.');
    process.exit(1);
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { corsOrigin } = require('./config/cors');
const { apiLimiter } = require('./middleware/rateLimiters');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const productRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const authRoutes = require('./routes/auth');
const { connectDB } = require('./config/db');
const { initSocket } = require('./config/socket');
const { initBackupScheduler } = require('./utils/backupScheduler');
const tableRoutes = require('./routes/tables');
const reservationRoutes = require('./routes/reservations');
const userRoutes = require('./routes/users');
const stockRoutes = require('./routes/stock');
const dashboardRoutes = require('./routes/dashboard');
const recipeRoutes = require('./routes/recipes');
const kdsRoutes = require('./routes/kds');
const reportRoutes = require('./routes/reports');
const shiftRoutes = require('./routes/shifts');
const auditRoutes = require('./routes/audit');
const extraRoutes = require('./routes/extras');
const syrupRoutes = require('./routes/syrups');
const settingsRoutes = require('./routes/settings');
const invoiceRoutes = require('./routes/invoices');
const tableAreaRoutes = require('./routes/tableAreas');
const invoiceProviderSettingsRoutes = require('./routes/invoiceProviderSettings');
const publicMenuRoutes = require('./routes/publicMenu');
const customerOrderRoutes = require('./routes/customerOrders');
const serviceRequestRoutes = require('./routes/serviceRequests');
const campaignRoutes = require('./routes/campaigns');
const loyaltyRoutes = require('./routes/loyalty');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 4091;

// Middleware'ler
app.use(helmet({
    // Ürün resimleri farklı origin'den (panel) yükleneceği için cross-origin resource izni.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({ origin: corsOrigin }));
app.use(express.json());
app.use('/api', apiLimiter); // tüm API trafiğine geniş kötüye-kullanım tavanı
app.use('/uploads', express.static('uploads')); // ürün resimleri buradan servis edilir

// Test endpoint'i
app.get('/', (req, res) => {
    res.send('Restoran API calisiyor');
});

// Route kayıtları
app.use('/api/products', productRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/kds', kdsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/extras', extraRoutes);
app.use('/api/syrups', syrupRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/table-areas', tableAreaRoutes);
app.use('/api/invoice-provider-settings', invoiceProviderSettingsRoutes);
app.use('/api/public/menu', publicMenuRoutes);
app.use('/api/customer-orders', customerOrderRoutes);
app.use('/api/service-requests', serviceRequestRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/loyalty', loyaltyRoutes);

// Hata yönetimi (TÜM route'lardan SONRA olmalı)
app.use(notFoundHandler);
app.use(errorHandler);

// Sunucuyu başlat
async function startServer() {
    try {
        await connectDB();
        initSocket(httpServer);
        initBackupScheduler();
        httpServer.listen(PORT, () => {
            console.log(`Sunucu http://localhost:${PORT} adresinde calisiyor`);
        });
    } catch (err) {
        console.error('Sunucu baslatilamadi:', err);
    }
}

// Doğrudan çalıştırıldığında sunucuyu başlat; test (supertest) require ederse
// yalnızca app export edilir, DB bağlanmaz / port dinlenmez.
if (require.main === module) {
    startServer();
}

module.exports = app;