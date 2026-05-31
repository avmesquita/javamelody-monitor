# JavaMelody History API — NestJS

API REST de histórico que lê do MongoDB os dados persistidos pelo BFF.
Swagger disponível em `/api/docs` após iniciar.

## Instalação

```bash
cp .env.example .env
npm install
npm run start:dev   # desenvolvimento com watch
npm run build && npm run start:prod   # produção
```

## Configuração (.env)

| Variável      | Descrição                        | Padrão                                  |
|---------------|----------------------------------|-----------------------------------------|
| MONGO_URI     | Connection string do MongoDB     | mongodb://localhost:27017/javamelody    |
| PORT          | Porta da API                     | 3001                                    |
| CORS_ORIGINS  | Origens Angular permitidas       | http://localhost:4200                   |

## Endpoints principais

| Método | Rota                                        | Descrição                        |
|--------|---------------------------------------------|----------------------------------|
| GET    | /api/history/clients/:id/latest?limit=60    | Últimas N amostras               |
| GET    | /api/history/clients/:id/series             | Série temporal com filtro data   |
| GET    | /api/history/clients/:id/hourly?hours=24    | Médias horárias agregadas        |
| GET    | /api/history/clients/:id/errors/latest      | Último snapshot de erros         |
| GET    | /api/history/clients/all/latest             | Todas as amostras recentes       |
| GET    | /api/history/alerts                         | Alertas de mudança de status     |
| GET    | /api/docs                                   | Swagger UI                       |

## Estrutura MongoDB

### Coleção `metrics`
Ponto de série temporal salvo a cada polling do BFF (30s por padrão).
TTL automático: documentos removidos após 90 dias.

### Coleção `alerts`  
Registrada toda vez que um cliente muda de status (ok → warn, warn → err, etc).
TTL automático: removidos após 180 dias.
