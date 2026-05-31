# JavaMelody Monitor

Dashboard centralizado para monitorar múltiplas instâncias JavaMelody,
com autenticação JSF/PrimeFaces, persistência MongoDB e histórico de série temporal.

## Arquitetura

```
Browser
  │
  ├─► Dashboard Angular  (porta 4200 / nginx)
  │     │
  │     ├─► BFF Express   (porta 3000)  ──► JavaMelody dos clientes
  │     │     └─► MongoDB (porta 27017) ◄── persiste métricas
  │     │
  │     └─► History API NestJS (porta 3001) ──► MongoDB (lê histórico)
  │
  └─► Mongo Express      (porta 8081)  ── UI admin (opcional)
```

---

## Início rápido com Docker

### 1. Configure os clientes

```bash
cp javamelody-bff/clients.json.example javamelody-bff/clients.json
# edite clients.json com URLs e credenciais de cada sistema
```

### 2. Ajuste variáveis de ambiente (opcional)

```bash
# O .env na raiz já tem valores padrão funcionais
# Altere senhas do MongoDB antes de usar em produção
nano .env
```

### 3. Suba tudo

```bash
docker compose up -d
```

### 4. Acesse

| Serviço           | URL                          |
|-------------------|------------------------------|
| Dashboard         | http://localhost:4200        |
| BFF (health)      | http://localhost:3000/health |
| History API docs  | http://localhost:3001/api/docs |

### Com UI do MongoDB (debug)

```bash
docker compose --profile debug up -d
# Acesse http://localhost:8081  (admin / mongoexpresspass)
```

---

## Desenvolvimento local (sem Docker)

```bash
# Terminal 1 — MongoDB (requer Docker apenas para o banco)
docker compose up mongo -d

# Terminal 2 — BFF
cd javamelody-bff
cp .env.example .env && cp clients.json.example clients.json
npm install && node server.js

# Terminal 3 — History API
cd javamelody-api
cp .env.example .env
npm install && npm run start:dev

# Terminal 4 — Angular
cd javamelody-dashboard
npm install && ng serve
```

---

## Habilitar/desabilitar persistência

**Via .env** (requer restart do BFF):
```
MONGO_ENABLED=true   # ou false
```

**Em runtime** (sem restart), via API:
```bash
# Habilitar
curl -X POST http://localhost:3000/config \
  -H "Content-Type: application/json" \
  -d '{"persistenceEnabled": true}'

# Desabilitar
curl -X POST http://localhost:3000/config \
  -H "Content-Type: application/json" \
  -d '{"persistenceEnabled": false}'
```

Ou pelo botão **"MongoDB ativo / Sem persistência"** na topbar do dashboard.

---

## Estrutura do projeto

```
.
├── docker-compose.yml
├── mongo-init.js              # inicialização do MongoDB
├── .env                       # variáveis do docker-compose
├── javamelody-bff/            # BFF Node/Express
│   ├── Dockerfile
│   ├── server.js
│   ├── clients.json.example
│   └── .env.example
├── javamelody-api/            # History API NestJS
│   ├── Dockerfile
│   ├── src/
│   │   ├── metrics/
│   │   └── alerts/
│   └── .env.example
└── javamelody-dashboard/      # Frontend Angular 20
    ├── Dockerfile
    ├── nginx.conf
    └── src/
```

---

## Rebuild após alterações

```bash
# Rebuild de um serviço específico
docker compose up -d --build bff

# Rebuild de tudo
docker compose up -d --build
```

## Dados do MongoDB

- **`metrics`** — série temporal, TTL 90 dias
- **`alerts`** — mudanças de status, TTL 180 dias

Gerenciados automaticamente pelo índice TTL do MongoDB — sem necessidade de jobs de limpeza.

---

## Catálogo de Erros com IA

O catálogo auto-constrói um dicionário de problemas identificados em produção.

### Como funciona

1. O BFF detecta erros HTTP/SQL no polling do JavaMelody
2. Gera um hash `exception_type + uri_normalizada + status_http`
3. Se o hash é novo → cria entrada no catálogo + dispara análise Claude API (async)
4. Se o hash já existe → incrementa contador de ocorrências
5. O dev acessa a aba **Catálogo de Erros** no dashboard e vê:
   - Causa provável + soluções sugeridas pela IA
   - Categoria (Database, Memory, Network, etc.) e severidade
   - Histórico de ocorrências
6. Registra a solução real que funcionou e fecha como `Resolvido`

### Configuração da IA

Adicione a chave no `.env` da raiz:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Sem a chave, o catálogo ainda funciona — erros são coletados e catalogados, mas a análise IA fica em estado `aiError: "ANTHROPIC_API_KEY não configurada"`. Você pode reanalsar depois adicionando a chave e clicando em "Reanalisar".

### Endpoints do catálogo (NestJS API)

| Método | Rota                              | Descrição                          |
|--------|-----------------------------------|------------------------------------|
| GET    | /api/catalog                      | Lista com filtros                  |
| GET    | /api/catalog/stats                | Totais por status e severidade     |
| GET    | /api/catalog/:id                  | Detalhe completo                   |
| PATCH  | /api/catalog/:id/status           | Atualiza status + solução do dev   |
| POST   | /api/catalog/:id/reanalyze        | Re-analisa com IA sob demanda      |
| POST   | /api/catalog/ingest               | Ingere erro (usado pelo BFF)       |

<img width="1170" height="855" alt="image" src="https://github.com/user-attachments/assets/967de280-8b77-4e4f-8cca-cf8422b59cb8" />


