// ============================================================
// Canlı MSSQL şemasından TEKRARSIZ DBML üretir.
// Her tablo tek tanım, her ilişki tek Ref. dbdiagram.io uyumlu.
// Çıktı: schema.dbml (proje kökü)
//
// Kullanım: node scripts/gen-dbml.js
// ============================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, sql } = require('../config/db');

// SQL Server tipini DBML tipine çevir.
function dbmlType(typeName, maxLen, precision, scale) {
  const t = typeName.toLowerCase();
  if (['nvarchar', 'nchar', 'varchar', 'char', 'varbinary', 'binary'].includes(t)) {
    // nchar/nvarchar max_length bayt cinsindendir (2x); -1 = MAX
    const isWide = t.startsWith('n');
    const len = maxLen === -1 ? 'max' : String(isWide ? maxLen / 2 : maxLen);
    return `${t}(${len})`;
  }
  if (['decimal', 'numeric'].includes(t)) return `${t}(${precision},${scale})`;
  return t;
}

async function run() {
  const pool = await connectDB();

  // 1) Kolonlar
  const cols = (await pool.request().query(`
    SELECT t.name AS TableName, c.name AS ColName, ty.name AS TypeName,
           c.max_length AS MaxLen, c.precision AS Prec, c.scale AS Scale,
           c.is_nullable AS IsNullable, c.is_identity AS IsIdentity, c.column_id AS ColId
    FROM sys.tables t
    JOIN sys.columns c ON c.object_id = t.object_id
    JOIN sys.types ty ON ty.user_type_id = c.user_type_id
    WHERE t.is_ms_shipped = 0 AND t.name NOT IN ('sysdiagrams', 'dtproperties')
    ORDER BY t.name, c.column_id
  `)).recordset;

  // 2) İndeksler (PK / unique) — kolon sırasıyla
  const idx = (await pool.request().query(`
    SELECT t.name AS TableName, i.name AS IndexName, i.index_id AS IndexId,
           i.is_primary_key AS IsPk, i.is_unique_constraint AS IsUq, i.is_unique AS IsUnique,
           col.name AS ColName, ic.key_ordinal AS Ord
    FROM sys.indexes i
    JOIN sys.tables t ON t.object_id = i.object_id
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns col ON col.object_id = ic.object_id AND col.column_id = ic.column_id
    WHERE (i.is_primary_key = 1 OR i.is_unique_constraint = 1 OR i.is_unique = 1)
      AND ic.is_included_column = 0
      AND t.is_ms_shipped = 0 AND t.name NOT IN ('sysdiagrams', 'dtproperties')
    ORDER BY t.name, i.index_id, ic.key_ordinal
  `)).recordset;

  // 3) Foreign key'ler
  const fks = (await pool.request().query(`
    SELECT tp.name AS ParentTable, cp.name AS ParentCol,
           tr.name AS RefTable, cr.name AS RefCol,
           fkc.constraint_column_id AS Ord, fk.object_id AS FkId
    FROM sys.foreign_keys fk
    JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    JOIN sys.tables tp ON tp.object_id = fk.parent_object_id
    JOIN sys.columns cp ON cp.object_id = tp.object_id AND cp.column_id = fkc.parent_column_id
    JOIN sys.tables tr ON tr.object_id = fk.referenced_object_id
    JOIN sys.columns cr ON cr.object_id = tr.object_id AND cr.column_id = fkc.referenced_column_id
    ORDER BY tp.name, fk.object_id, fkc.constraint_column_id
  `)).recordset;

  // ---- İndeksleri grupla ----
  const indexGroups = new Map(); // key: Table||IndexId -> { table, isPk, isUq, isUnique, cols: [] }
  for (const r of idx) {
    const k = `${r.TableName}||${r.IndexId}`;
    if (!indexGroups.has(k)) indexGroups.set(k, { table: r.TableName, isPk: r.IsPk, isUq: r.IsUq, isUnique: r.IsUnique, cols: [] });
    indexGroups.get(k).cols.push(r.ColName);
  }

  // Her tablo için: tek-kolon pk seti, tek-kolon unique seti, çok-kolon unique listesi
  const pkSingle = new Map();   // table -> Set(col)
  const uqSingle = new Map();   // table -> Set(col)
  const uqComposite = new Map(); // table -> [[cols], ...]
  for (const g of indexGroups.values()) {
    if (g.isPk) {
      if (g.cols.length === 1) {
        if (!pkSingle.has(g.table)) pkSingle.set(g.table, new Set());
        pkSingle.get(g.table).add(g.cols[0]);
      } else {
        if (!uqComposite.has(g.table)) uqComposite.set(g.table, []);
        uqComposite.get(g.table).push({ cols: g.cols, pk: true });
      }
    } else if (g.isUq || g.isUnique) {
      if (g.cols.length === 1) {
        if (!uqSingle.has(g.table)) uqSingle.set(g.table, new Set());
        uqSingle.get(g.table).add(g.cols[0]);
      } else {
        if (!uqComposite.has(g.table)) uqComposite.set(g.table, []);
        // Aynı kolon kümesini tekrar ekleme (dedup)
        const sig = g.cols.join(',');
        const exists = uqComposite.get(g.table).some((x) => x.cols.join(',') === sig);
        if (!exists) uqComposite.get(g.table).push({ cols: g.cols, pk: false });
      }
    }
  }

  // ---- Kolonları tabloya göre grupla ----
  const tableCols = new Map();
  for (const c of cols) {
    if (!tableCols.has(c.TableName)) tableCols.set(c.TableName, []);
    tableCols.get(c.TableName).push(c);
  }

  // ---- DBML üret ----
  const out = [];
  out.push('// ============================================================');
  out.push('// Restoran Backend — Veritabanı Şeması (DBML)');
  out.push('// Canlı MSSQL şemasından otomatik üretildi (scripts/gen-dbml.js).');
  out.push('// Her tablo tek tanım, her ilişki tek Ref — dbdiagram.io uyumlu.');
  out.push('// ============================================================');
  out.push('');

  const tableNames = [...tableCols.keys()].sort();
  for (const tbl of tableNames) {
    out.push(`Table ${tbl} {`);
    for (const c of tableCols.get(tbl)) {
      const settings = [];
      const isPk = pkSingle.get(tbl)?.has(c.ColName);
      if (isPk) settings.push('pk');
      if (c.IsIdentity) settings.push('increment');
      if (uqSingle.get(tbl)?.has(c.ColName) && !isPk) settings.push('unique');
      if (!c.IsNullable && !isPk) settings.push('not null');
      const type = dbmlType(c.TypeName, c.MaxLen, c.Prec, c.Scale);
      const suffix = settings.length ? ` [${settings.join(', ')}]` : '';
      out.push(`  ${c.ColName} ${type}${suffix}`);
    }
    // Çok kolonlu unique/pk indeksleri
    const comps = uqComposite.get(tbl) || [];
    if (comps.length) {
      out.push('');
      out.push('  indexes {');
      for (const comp of comps) {
        out.push(`    (${comp.cols.join(', ')}) [${comp.pk ? 'pk' : 'unique'}]`);
      }
      out.push('  }');
    }
    out.push('}');
    out.push('');
  }

  // ---- Ref'ler (dedup) ----
  // Çok kolonlu FK'leri grupla, tek satır Ref üret; tekrarlı ilişkileri ele.
  const fkGroups = new Map(); // FkId -> { parent, ref, pairs: [[pcol, rcol]] }
  for (const r of fks) {
    if (!fkGroups.has(r.FkId)) fkGroups.set(r.FkId, { parent: r.ParentTable, ref: r.RefTable, pairs: [] });
    fkGroups.get(r.FkId).pairs.push([r.ParentCol, r.RefCol]);
  }
  const seenRefs = new Set();
  const refLines = [];
  for (const g of fkGroups.values()) {
    const pcols = g.pairs.map((p) => p[0]);
    const rcols = g.pairs.map((p) => p[1]);
    const left = pcols.length === 1 ? `${g.parent}.${pcols[0]}` : `${g.parent}.(${pcols.join(', ')})`;
    const right = rcols.length === 1 ? `${g.ref}.${rcols[0]}` : `${g.ref}.(${rcols.join(', ')})`;
    const sig = `${left}>${right}`;
    if (seenRefs.has(sig)) continue; // aynı ilişki için tekrar Ref üretme
    seenRefs.add(sig);
    refLines.push(`Ref: ${left} > ${right}`);
  }
  refLines.sort();

  out.push('// ---------- İlişkiler (Foreign Keys) ----------');
  out.push(...refLines);
  out.push('');

  const target = path.join(__dirname, '..', 'schema.dbml');
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  console.log(`DBML üretildi: ${target}`);
  console.log(`Tablo: ${tableNames.length}, Ref: ${refLines.length}`);

  await sql.close();
}

run().catch((e) => { console.error(e.message); process.exit(1); });
