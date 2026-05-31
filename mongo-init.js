// Executado pelo MongoDB na primeira inicialização do container
// Cria um usuário dedicado para a aplicação (sem precisar usar o root)

db = db.getSiblingDB('javamelody');

db.createUser({
  user: 'javamelody_app',
  pwd:  'javamelody_app_pass',   // sobrescreva via MONGO_APP_PASS no .env
  roles: [{ role: 'readWrite', db: 'javamelody' }],
});

// Cria as coleções com índices antecipadamente
// (o Mongoose também cria, mas é mais rápido já ter)
db.createCollection('metrics');
db.metrics.createIndex({ clientId: 1, collectedAt: -1 });
db.metrics.createIndex({ collectedAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 dias

db.createCollection('alerts');
db.alerts.createIndex({ clientId: 1, occurredAt: -1 });
db.alerts.createIndex({ occurredAt: 1 }, { expireAfterSeconds: 15552000 }); // 180 dias

db.createCollection('catalog');
db.catalog.createIndex({ hash: 1 }, { unique: true });
db.catalog.createIndex({ clientId: 1, status: 1 });
db.catalog.createIndex({ lastSeenAt: -1 });

print('MongoDB inicializado para javamelody.');
