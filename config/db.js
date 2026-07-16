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
        console.log('Başarılı');
        return pool;
    } catch (err) {
        console.error('Başarısız:', err);
        throw err;
    }
}

module.exports = { connectDB, sql };