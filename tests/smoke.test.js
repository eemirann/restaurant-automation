// Güvenli smoke testleri: DB'ye YAZMAZ. 401/404 middleware'de kısa devre
// yaptığı için controller/DB'ye ulaşmaz; kök uç statiktir.
// server.js require edilince startServer() ÇALIŞMAZ (require.main !== module),
// yalnızca Express app export edilir.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const request = require('supertest');
const app = require('../server');

describe('smoke', () => {
  test('kök sağlık ucu 200 döner', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/calisiyor/i);
  });

  test('korumalı uç token olmadan 401 döner', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(401);
  });

  test('geçersiz token 401 döner', async () => {
    const res = await request(app).get('/api/products').set('Authorization', 'Bearer sahte-token');
    expect(res.status).toBe(401);
  });

  test('admin ucu (audit) token olmadan 401 döner', async () => {
    const res = await request(app).get('/api/audit');
    expect(res.status).toBe(401);
  });

  test('bilinmeyen uç 404 döner', async () => {
    const res = await request(app).get('/api/bilinmeyen-uc-xyz');
    expect(res.status).toBe(404);
  });
});
