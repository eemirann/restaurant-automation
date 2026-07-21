require('dotenv').config();
const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/products');
const categoriesRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payment');
const authRoutes = require('./routes/auth');
const { connectDB } = require('./config/db');
const tableRoutes = require('./routes/tables');
const reservationRoutes = require('./routes/reservations');
const userRoutes = require('./routes/users');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware'ler
app.use(cors());
app.use(express.json());

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

// Sunucuyu başlat
async function startServer() {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Sunucu http://localhost:${PORT} adresinde calisiyor`);
        });
    } catch (err) {
        console.error('Sunucu baslatilamadi:', err);
    }
}

startServer();