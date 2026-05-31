'use strict';

const { MongoClient } = require('mongodb');

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURE AQUI
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  // URI de conexão com usuário admin (que tem permissão para criar usuários) admin:sua_senha_admin@
  adminUri:    'mongodb://localhost:27017', // /admin

  // Banco da aplicação
  database:    'javamelody',

  // Usuário que o BFF e a API vão usar — permissão só neste banco
  appUser:     'javamelody_app',
  appPassword: 'javamelody_app_pass',

  // TTL das coleções em segundos
  ttlMetrics:  90  * 24 * 3600,   // 90 dias
  ttlAlerts:   180 * 24 * 3600,   // 180 dias
};
// ─────────────────────────────────────────────────────────────────────────────

async function run() {
  console.log('\n=== JavaMelody — MongoDB Setup ===\n');

  const client = new MongoClient(CONFIG.adminUri);
  await client.connect();
  console.log('✔ Conectado ao MongoDB');

  const adminDb = client.db('admin');
  const appDb   = client.db(CONFIG.database);

  // ── Usuário da aplicação ────────────────────────────────────────────────────
  try {
    await adminDb.command({
      createUser: CONFIG.appUser,
      pwd:        CONFIG.appPassword,
      roles:      [{ role: 'readWrite', db: CONFIG.database }],
    });
    console.log(`✔ Usuário "${CONFIG.appUser}" criado.`);
  } catch (err) {
    if (err.code === 51003 || err.message.includes('already exists')) {
      // Usuário já existe — atualiza a senha
      await adminDb.command({
        updateUser: CONFIG.appUser,
        pwd:        CONFIG.appPassword,
      });
      console.log(`ℹ  Usuário "${CONFIG.appUser}" já existia — senha atualizada.`);
    } else {
      throw err;
    }
  }

  // ── Coleção: metrics ─────────────────────────────────────────────────────────
  await ensureCollection(appDb, 'metrics');
  await ensureIndex(appDb, 'metrics',
    { clientId: 1, collectedAt: -1 },
    { name: 'idx_metrics_client_time' }
  );
  await ensureIndex(appDb, 'metrics',
    { collectedAt: 1 },
    { name: 'idx_metrics_ttl', expireAfterSeconds: CONFIG.ttlMetrics }
  );

  // ── Coleção: alerts ──────────────────────────────────────────────────────────
  await ensureCollection(appDb, 'alerts');
  await ensureIndex(appDb, 'alerts',
    { clientId: 1, occurredAt: -1 },
    { name: 'idx_alerts_client_time' }
  );
  await ensureIndex(appDb, 'alerts',
    { occurredAt: 1 },
    { name: 'idx_alerts_ttl', expireAfterSeconds: CONFIG.ttlAlerts }
  );

  // ── Coleção: catalog ─────────────────────────────────────────────────────────
  await ensureCollection(appDb, 'catalog');
  await ensureIndex(appDb, 'catalog',
    { hash: 1 },
    { name: 'idx_catalog_hash', unique: true }
  );
  await ensureIndex(appDb, 'catalog',
    { clientId: 1, status: 1 },
    { name: 'idx_catalog_client_status' }
  );
  await ensureIndex(appDb, 'catalog',
    { lastSeenAt: -1 },
    { name: 'idx_catalog_last_seen' }
  );
  await ensureIndex(appDb, 'catalog',
    { 'aiAnalysis.severity': 1 },
    { name: 'idx_catalog_severity' }
  );

  await client.close();

  console.log('\n=== Setup concluído ===');
  console.log(`Banco:    ${CONFIG.database}`);
  console.log(`Usuário:  ${CONFIG.appUser}`);
  console.log('\nCopie esta string para o .env do BFF e da API:');
  const host = new URL(CONFIG.adminUri).host;
  console.log(`MONGO_URI=mongodb://${CONFIG.appUser}:${CONFIG.appPassword}@${host}/${CONFIG.database}\n`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureCollection(db, name) {
  const existing = await db.listCollections({ name }).toArray();
  if (existing.length === 0) {
    await db.createCollection(name);
    console.log(`✔ Coleção "${name}" criada.`);
  } else {
    console.log(`ℹ  Coleção "${name}" já existe.`);
  }
}

async function ensureIndex(db, collection, keys, options) {
  try {
    await db.collection(collection).createIndex(keys, options);
    console.log(`  ✔ Índice "${options.name}" em "${collection}".`);
  } catch (err) {
    if (err.code === 85 || err.code === 86) {
      console.log(`  ℹ  Índice "${options.name}" já existe.`);
    } else {
      throw err;
    }
  }
}

run().catch(err => {
  console.error('\n✘ Erro:', err.message);
  process.exit(1);
});
