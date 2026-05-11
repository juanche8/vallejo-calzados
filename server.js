'use strict';

const express = require('express');
const sql     = require('mssql');
const path    = require('path');
const fs      = require('fs');

const app = express();
app.use(express.json({ limit: '50mb' }));

// ── SQL Server ────────────────────────────────────────────────────────────────
const dbConfig = {
    server:   '10.0.0.115',
    user:     'sa',
    password: 'MicroS123',
    database: 'db_cegid',
    options: {
        encrypt:               false,
        trustServerCertificate: true
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let pool;
async function getPool() {
    if (!pool) pool = await sql.connect(dbConfig);
    return pool;
}

// ── Uploads folder ────────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(__dirname));

// ── Helpers ───────────────────────────────────────────────────────────────────
function saveBase64Image(dataUrl, prefix) {
    if (!dataUrl) return null;
    const m = dataUrl.match(/^data:([\w/+]+);base64,(.+)$/);
    if (!m) return null;
    const ext      = m[1].split('/')[1]?.split('+')[0] || 'jpg';
    const filename = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(m[2], 'base64'));
    return filename;
}

// ── Productos ─────────────────────────────────────────────────────────────────
app.get('/api/productos', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.request().execute('SP_TBL_PRODUCTOS_PRE_ALTA_GET');
        res.json(r.recordset);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/productos', async (req, res) => {
    try {
        const d       = req.body;
        const imgOrig = saveBase64Image(d.imagen_original, 'orig');
        const imgEdit = saveBase64Image(d.imagen_editada,  'edit');

        const p = await getPool();
        const r = await p.request()
            .input('codarticulo',     sql.VarChar(100), d.codarticulo     || '')
            .input('nommarca',        sql.VarChar(100), d.nommarca        || '')
            .input('nomprov',         sql.VarChar(100), d.nomprov         || '')
            .input('nomseccion',      sql.VarChar(100), d.nomseccion      || '')
            .input('nomgenero',       sql.VarChar(100), d.nomgenero       || '')
            .input('nomflia',         sql.VarChar(100), d.nomflia         || '')
            .input('nomlinea',        sql.VarChar(100), d.nomlinea        || '')
            .input('temporada',       sql.VarChar(100), d.temporada       || '')
            .input('tituloseo',       sql.VarChar(500),  d.tituloseo       || '')
            .input('descripcion',     sql.VarChar(sql.MAX), d.descripcion  || '')
            .input('color',           sql.VarChar(100),  d.color           || '')
            .input('material',        sql.VarChar(100),  d.material        || '')
            .input('talle',           sql.VarChar(500),  d.talle           || '')
            .input('costo',           sql.VarChar(100),  d.costo           || '')
            .input('precio',          sql.VarChar(100),  d.precio          || '')
            .input('nomdep',          sql.VarChar(100), d.nomdep          || '')
            .input('observaciones',   sql.VarChar(sql.MAX), d.observaciones || null)
            .input('disponibilidad',  sql.VarChar(sql.MAX), d.disponibilidad || null)
            .input('imagen_original', sql.VarChar(500),  imgOrig)
            .input('imagen_editada',  sql.VarChar(500),  imgEdit)
            .execute('SP_TBL_PRODUCTOS_PRE_ALTA_INSERT');

        const insertedId = r.recordset[0]?.id_insertado;

        // El SP no persiste disponibilidad → UPDATE directo para garantizarlo
        if (insertedId && d.disponibilidad) {
            await p.request()
                .input('id',             sql.Int,              insertedId)
                .input('disponibilidad', sql.VarChar(sql.MAX), d.disponibilidad)
                .query('UPDATE TBL_PRODUCTOS_PRE_ALTA SET disponibilidad = @disponibilidad WHERE id = @id');
        }

        res.json({ success: true, id: insertedId });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/productos/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const p   = await getPool();
        const row = await p.request()
            .input('id', sql.Int, id)
            .query('SELECT imagen_original, imagen_editada FROM TBL_PRODUCTOS_PRE_ALTA WHERE id = @id');

        if (row.recordset.length > 0) {
            const { imagen_original, imagen_editada } = row.recordset[0];
            [imagen_original, imagen_editada].forEach(f => {
                if (f) {
                    const fp = path.join(uploadsDir, f);
                    if (fs.existsSync(fp)) fs.unlinkSync(fp);
                }
            });
        }

        await p.request()
            .input('id', sql.Int, id)
            .query('DELETE FROM TBL_PRODUCTOS_PRE_ALTA WHERE id = @id');

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Marcas locales (pre-alta viaje) ───────────────────────────────────────────
const marcasLocalPath = path.join(__dirname, 'marcas_local.json');

function getMarcasLocal() {
    if (!fs.existsSync(marcasLocalPath)) return [];
    try { return JSON.parse(fs.readFileSync(marcasLocalPath, 'utf8')); }
    catch { return []; }
}

app.get('/api/marcas-local', (req, res) => {
    res.json(getMarcasLocal());
});

app.post('/api/marcas-local', (req, res) => {
    const { marca, proveedor, observaciones } = req.body;
    if (!marca) return res.status(400).json({ error: 'Marca requerida' });
    const list = getMarcasLocal();
    const dup = list.find(x =>
        x.marca.toLowerCase() === marca.trim().toLowerCase() &&
        x.proveedor.toLowerCase() === (proveedor || '').trim().toLowerCase()
    );
    if (!dup) {
        list.push({ marca: marca.trim(), proveedor: (proveedor || '').trim(), observaciones: (observaciones || '').trim(), fecha: new Date().toISOString() });
        fs.writeFileSync(marcasLocalPath, JSON.stringify(list, null, 2));
    }
    res.json({ success: true });
});

// ── Lookups ───────────────────────────────────────────────────────────────────

// SP_OBTENER_MARCA_PROVEEDOR → { nommarca, nomprov } rows → grouped map
app.get('/api/marcas-proveedores', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.request().execute('SP_OBTENER_MARCA_PROVEEDOR');
        const map = {};
        r.recordset.forEach(row => {
            const vals     = Object.values(row);
            // Soporta CODMARCA, NOMMARCA, CODPROV, NOMPROV (mayúsculas o minúsculas)
            const codMarca = row.CODMARCA ?? row.codmarca ?? (vals.length >= 1 ? vals[0] : null);
            const marca    = row.NOMMARCA ?? row.nommarca ?? (vals.length >= 2 ? vals[1] : vals[0]);
            const codProv  = row.CODPROV  ?? row.codprov  ?? (vals.length >= 3 ? vals[2] : null);
            const nomProv  = row.NOMPROV  ?? row.nomprov  ?? (vals.length >= 4 ? vals[3] : vals[1]);
            if (!marca) return;
            if (!map[marca]) map[marca] = { codmarca: codMarca, proveedores: [] };
            const already = map[marca].proveedores.some(x => x.nombre === nomProv);
            if (nomProv && !already) map[marca].proveedores.push({ codigo: codProv ?? null, nombre: nomProv });
        });
        res.json(map);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Generic lookup helper — devuelve { codigo, nombre } si el SP tiene 2+ columnas,
// o string plano si solo tiene 1.
function lookupRoute(route, spName) {
    app.get(route, async (req, res) => {
        try {
            const p = await getPool();
            const r = await p.request().execute(spName);
            const rows = r.recordset;
            if (!rows.length) return res.json([]);
            const cols = Object.keys(rows[0]);
            if (cols.length >= 2) {
                // Primera columna = código, segunda = nombre
                res.json(rows
                    .map(row => ({ codigo: row[cols[0]], nombre: row[cols[1]] }))
                    .filter(x => x.nombre)
                );
            } else {
                res.json(rows.map(row => row[cols[0]]).filter(Boolean));
            }
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
}

lookupRoute('/api/lineas',     'SP_OBTENER_LINEAS');
lookupRoute('/api/temporadas', 'SP_OBTENER_TEMPORADAS');
lookupRoute('/api/familias',   'SP_OBTENER_FAMILIAS');
lookupRoute('/api/generos',    'SP_OBTENER_GENEROS');
lookupRoute('/api/secciones',  'SP_OBTENER_SECCION');
lookupRoute('/api/materiales', 'SP_OBTENER_MATERIALES');

// Colores → { COLOR_CEGID, CODIGO_COLOR }
app.get('/api/colores', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.request().execute('SP_OBTENER_COLORES');
        res.json(r.recordset.map(row => ({
            color: row.COLOR_CEGID ?? Object.values(row)[0],
            codigo: row.CODIGO_COLOR ?? Object.values(row)[1]
        })).filter(x => x.color));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Árbol de categorías eCommerce (Vallejo + SPT) por códigos CEGID
// GET /api/categorias-ecomm?genero=2&seccion=1&familia=130&linea=119
app.get('/api/categorias-ecomm', async (req, res) => {
    const { genero, seccion, familia, linea } = req.query;
    if (!genero || !seccion || !familia || !linea)
        return res.status(400).json({ error: 'Se requieren: genero, seccion, familia, linea' });
    try {
        const p = await getPool();
        const r = await p.request()
            .input('cegid_genero',  sql.Int, parseInt(genero))
            .input('cegid_seccion', sql.Int, parseInt(seccion))
            .input('cegid_familia', sql.Int, parseInt(familia))
            .input('cegid_linea',   sql.Int, parseInt(linea))
            .query(`SELECT * FROM dbo.fn_Traducir_Niveles_CEGID_a_Ecommerce(
                @cegid_genero, @cegid_seccion, @cegid_familia, @cegid_linea)`);
        const row = r.recordset[0] ?? {};
        res.json({
            vallejo: {
                nivel1: { codigo: row.Vallejo_CodNivel1 ?? null, nombre: row.Vallejo_NomNivel1 ?? null },
                nivel2: { codigo: row.Vallejo_CodNivel2 ?? null, nombre: row.Vallejo_NomNivel2 ?? null },
                nivel3: { codigo: row.Vallejo_CodNivel3 ?? null, nombre: row.Vallejo_NomNivel3 ?? null },
            },
            spt: {
                nivel1: { codigo: row.SPT_CodNivel1 ?? null, nombre: row.SPT_NomNivel1 ?? null },
                nivel2: { codigo: row.SPT_CodNivel2 ?? null, nombre: row.SPT_NomNivel2 ?? null },
                nivel3: { codigo: row.SPT_CodNivel3 ?? null, nombre: row.SPT_NomNivel3 ?? null },
            }
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Catálogos CEGID filtrados por nombre (todos los parámetros opcionales)
// GET /api/catalogos-cegid?NomSeccion=...&NomGenero=...&NomFamilia=...&NomLinea=...
app.get('/api/catalogos-cegid', async (req, res) => {
    const { NomSeccion, NomGenero, NomFamilia, NomLinea } = req.query;
    try {
        const p = await getPool();
        const r = await p.request()
            .input('NomSeccion', sql.NVarChar(60), NomSeccion || null)
            .input('NomGenero',  sql.NVarChar(60), NomGenero  || null)
            .input('NomFamilia', sql.NVarChar(80), NomFamilia || null)
            .input('NomLinea',   sql.NVarChar(80), NomLinea   || null)
            .execute('SP_OBTENER_CATALOGOS_CEGID');
        res.json(r.recordset);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Talles por marca+género+sección
app.get('/api/talles', async (req, res) => {
    const { nommarca, nomgenero, nomseccion } = req.query;
    if (!nommarca || !nomgenero) return res.json([]);
    try {
        const p = await getPool();
        const r = await p.request()
            .input('nommarca',   sql.VarChar(100), nommarca)
            .input('nomgenero',  sql.VarChar(100), nomgenero)
            .input('nomseccion', sql.VarChar(100), nomseccion || '')
            .execute('SP_OBTENER_DIMENSION_TALLES');
        res.json(r.recordset);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Postventa: Sucursales ─────────────────────────────────────────────────────
app.get('/api/sucursales', async (req, res) => {
    try {
        const p = await getPool();
        const r = await p.request().execute('SP_POSTVENTA_OBTENER_SUCURSALES');
        res.json(r.recordset);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Servidor Vallejo Calzados corriendo en http://localhost:${PORT}`);
    console.log(`Conectando a SQL Server ${dbConfig.server}/${dbConfig.database}...`);
    getPool()
        .then(() => console.log('✅ Conexión a SQL Server exitosa'))
        .catch(e  => console.error('❌ Error conectando a SQL Server:', e.message));
});
