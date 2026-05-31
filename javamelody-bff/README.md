# JavaMelody BFF — Multi-cliente com autenticação JSF

Serviço intermediário que gerencia sessões JSF independentes para cada cliente
e expõe os dados do JavaMelody para o dashboard Angular.

---

## Instalação

```bash
cp .env.example .env
cp clients.json.example clients.json
# edite clients.json com as URLs e credenciais reais de cada cliente
npm install
npm start
```

---

## Configuração de clientes (clients.json)

Cada cliente tem sua própria URL, usuário e senha:

```json
[
  {
    "id": 1,
    "name": "Nome do Cliente",
    "baseUrl": "http://app.cliente.com.br:8080",
    "username": "usuario_monitoramento",
    "password": "senha"
  }
]
```

Adicione quantos clientes precisar. O BFF faz login em cada um
de forma independente na inicialização e renova as sessões automaticamente.

---

## Endpoints

| Método | Rota                                  | Descrição                                        |
|--------|---------------------------------------|--------------------------------------------------|
| GET    | /health                               | Status do BFF e sessão ativa por cliente         |
| GET    | /api/clients                          | Lista de clientes (sem credenciais)              |
| GET    | /api/clients/all/monitoring           | Métricas de todos os clientes de uma vez         |
| GET    | /api/clients/:id/monitoring           | Métricas gerais de um cliente específico         |
| GET    | /api/clients/:id/monitoring/requests  | Top requisições HTTP de um cliente               |
| GET    | /api/clients/:id/monitoring/sessions  | Sessões ativas de um cliente                     |
| GET    | /api/clients/:id/monitoring/threads   | Threads de um cliente                            |
| POST   | /api/clients/:id/session/refresh      | Força re-login de um cliente específico          |

---

## Como funciona o gerenciamento de sessões

```
Inicialização
  └─ Para cada cliente em clients.json:
       GET  /login.jsf           → extrai javax.faces.ViewState
       POST /login.jsf + campos  → recebe JSESSIONID
       Armazena { cookie, expiry: agora + 25min }

A cada requisição ao /monitoring
  └─ Sessão ainda válida?  → usa o cookie existente
     Sessão expirada?      → refaz o login automaticamente
     Servidor retornou 302?→ detecta expiração, renova, repete

/api/clients/all/monitoring
  └─ Dispara todas as requisições em paralelo (Promise.allSettled)
     Clientes com erro retornam { error: "mensagem" } sem derrubar os outros
```

---

## Campos do formulário JSF

Se o sistema tiver campos com nomes diferentes, ajuste o objeto `body`
no método `doLogin()` do `server.js`:

```javascript
const body = new URLSearchParams({
  'mfaLoginForm':                          'mfaLoginForm',
  'mfaLoginForm:mfaPanelLogin:username':   cfg.username,  // ← name do input
  'mfaLoginForm:mfaPanelLogin:password':   cfg.password,  // ← name do input
  'javax.faces.ViewState':                 viewState,
});
```

Os valores corretos são os atributos `name` dos inputs na página de login.

---

## Segurança

- `clients.json` contém credenciais — **não versione este arquivo** (já está no .gitignore)
- O BFF nunca expõe credenciais nas respostas HTTP
- O endpoint `/api/clients` retorna apenas `id`, `name` e `baseUrl`
