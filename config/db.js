const sql = require('mssql');
require('dotenv').config({ quiet: true });

const dbConfig = {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT),
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function connectDB() {
    try {
        const pool = await sql.connect(dbConfig);
        console.log('Veritabanina basarili');
        return pool;
    } catch (err) {
        console.error('Veritabani basarisiz:', err);
        throw err;
    }
}

module.exports = { connectDB, sql };