require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const productRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const authRoutes = require('./routes/auth');
const { connectDB } = require('./config/db');
const { initSocket } = require('./config/socket');
const tableRoutes = require('./routes/tables');
const reservationRoutes = require('./routes/reservations');
const userRoutes = require('./routes/users');
const stockRoutes = require('./routes/stock');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware'ler
app.use(cors());
app.use(express.json());
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

// Sunucuyu başlat
async function startServer() {
    try {
        await connectDB();
        initSocket(httpServer);
        httpServer.listen(PORT, () => {
            console.log(`Sunucu http://localhost:${PORT} adresinde calisiyor`);
        });
    } catch (err) {
        console.error('Sunucu baslatilamadi:', err);
    }
}

startServer();