const express = require('express');
const cors = require('cors');
const productRoutes = require('./routes/products');
const { connectDB } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware'ler
app.use(cors());
app.use(express.json());

// Test endpoint'i
app.get('/', (req, res) => {
    res.send('Restoran API calisiyor');
    app.use('/api/products', productRoutes);
});

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
