// mssql'i taklit eden test yardımcı modülü.
// jest.mock('../config/db', () => require('./helpers/fakeDb')) ile kullanılır.
// Testler __setHandler(fn) ile query metnine göre sahte sonuç döndürür.

let handler = async () => ({ recordset: [] });

// authMiddleware.verifyToken artık her istekte Users.IsActive/Role'ü DB'den
// okuyor (deaktive edilmiş kullanıcının token'ı hemen geçersiz olsun diye).
// Testler bunu tek tek __setHandler'da elle taklit etmek zorunda kalmasın
// diye bu sorguya özel bir varsayılan var: aksi __setUserActive ile
// belirtilmedikçe kullanıcı aktif kabul edilir ve rol için token'daki değer
// kullanılmaya devam eder (Role: null -> authMiddleware decoded.role'e döner).
let userActive = true;

function typeTag(name) {
    const fn = () => fn;
    fn.__type = name;
    return fn;
}

function createRequest() {
    const inputs = {};
    const req = {
        input(name, typeOrValue, value) {
            inputs[name] = arguments.length >= 3 ? value : typeOrValue;
            return req;
        },
        query: jest.fn(async (queryText) => {
            if (queryText.includes('SELECT IsActive, Role FROM Users WHERE UserId')) {
                return { recordset: [{ IsActive: userActive, Role: null }] };
            }
            const res = await handler(queryText, { ...inputs });
            return res || { recordset: [] };
        }),
    };
    return req;
}

class FakeTransaction {
    constructor(pool) {
        this.pool = pool;
    }
    async begin() {}
    async commit() {}
    async rollback() {}
}

const sql = {
    Int: typeTag('Int'),
    Decimal: typeTag('Decimal'),
    NVarChar: typeTag('NVarChar'),
    MAX: -1,
    Transaction: FakeTransaction,
    Request: function (_transaction) {
        return createRequest();
    },
};

const pool = { request: createRequest };

async function connectDB() {
    return pool;
}

// handler: (queryText, inputs) => { recordset: [...] } | undefined
function __setHandler(fn) {
    handler = fn;
}

// Deaktive-kullanıcı senaryosunu test etmek isteyen testler için (bkz.
// middleware/authMiddleware.js verifyToken).
function __setUserActive(value) {
    userActive = value;
}

function __reset() {
    handler = async () => ({ recordset: [] });
    userActive = true;
}

module.exports = { sql, connectDB, pool, __setHandler, __setUserActive, __reset };
