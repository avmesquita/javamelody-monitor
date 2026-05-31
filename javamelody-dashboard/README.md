# JavaMelody Monitor — Dashboard Angular 20

Dashboard centralizado para monitorar múltiplas instâncias JavaMelody a partir de um único painel.

## Funcionalidades

- **Grid de clientes** com status em tempo real (CPU, Heap, Sessões)
- **Traffic-light** automático: Normal / Atenção / Crítico
- **Polling automático** a cada 30 segundos (configurável)
- **Detalhamento por cliente**: top requisições HTTP, gráfico de heap, métricas de infra
- **Dados demo** incluídos — substitua pelo fetch real ao integrar

---

## Pré-requisitos

```
Node.js >= 18
Angular CLI 20  →  npm install -g @angular/cli@20
```

---

## Instalação e execução

```bash
npm install
ng serve          # http://localhost:4200
ng build --configuration=production
```

---

## Configuração de clientes reais

### 1. Defina os clientes em `src/environments/environment.ts`

```typescript
export const environment = {
  production: false,
  pollIntervalMs: 30_000,
  clients: [
    { id: 1, name: 'Cliente A', baseUrl: 'https://app.cliente.com.br', username: 'admin', password: 'senha' },
  ],
};
```

### 2. Ative o fetch real em `MelodyService.refresh()`

Substitua `this.simulateRefresh()` por:

```typescript
this.fetchAllClients(environment.clients).subscribe(metrics => {
  this._clients$.next(metrics);
  this._loading$.next(false);
  this._lastRefresh$.next(new Date());
});
```

---

## Endpoints JavaMelody consumidos

| Dados              | URL                                         |
|--------------------|---------------------------------------------|
| Status geral       | GET /monitoring?format=json                 |
| Requisições HTTP   | GET /monitoring?part=requests&format=json   |

---

## Regras de status

| Status     | Condição                          |
|------------|-----------------------------------|
| Normal     | CPU < 60% e Heap < 70%            |
| Atenção    | CPU >= 60% ou Heap >= 70%         |
| Crítico    | CPU >= 80% ou Heap >= 85%         |

---

## Estrutura

```
src/app/
├── models/            client.model.ts
├── services/          melody.service.ts
└── components/
    ├── dashboard/
    ├── client-card/
    ├── detail-panel/
    └── heap-chart/
```
