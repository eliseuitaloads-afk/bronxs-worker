# Bronxs CRM — Background Queue Worker

Worker Node.js desacoplado para processamento em segundo plano da fila `event_log` do Supabase.

---

## 📁 Estrutura do Projeto

```
worker/
├── Dockerfile          # Imagem leve baseada em node:20-slim para Easypanel / Docker
├── package.json        # Dependências mínimas (@supabase/supabase-js, dotenv)
├── index.js            # Loop resiliente de drenagem e processamento
├── .env.example        # Exemplo de variáveis de ambiente
├── .gitignore          # Proteção de credenciais e node_modules
└── README.md
```

---

## 🚀 Como Testar Localmente

1. **Acessar a pasta do worker:**
   ```bash
   cd worker
   ```

2. **Instalar as dependências:**
   ```bash
   npm install
   ```

3. **Criar o arquivo `.env`:**
   Copie `.env.example` para `.env` e preencha com as credenciais do Supabase:
   ```env
   SUPABASE_URL=https://pbtikhqmnrfqlehfksua.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=seu-token-service-role-aqui
   WORKER_INTERVAL_MS=5000
   WORKER_BATCH_SIZE=10
   ```

4. **Executar o Worker:**
   ```bash
   npm start
   ```
   *Ou em modo desenvolvimento com auto-reload:*
   ```bash
   npm run dev
   ```

5. **Testar com a fila:**
   - Ao receber uma mensagem real no WhatsApp/Instagram (ou ao existir um evento pendente na tabela `event_log`), o worker reivindicará o lote via `claim_events` e processará marcando como `done`.
   - Saída esperada no terminal:
     ```
     [worker] iniciado, intervalo 5000ms, batch 10
     [worker] ciclo: claimed=1 done=1 failed=0
     ```

---

## 🐳 Deploy no Easypanel (VPS)

1. Crie uma aplicação do tipo **App** / **Docker** no Easypanel apontando para o repositório do worker.
2. Configure as seguintes **Environment Variables** no Easypanel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `WORKER_INTERVAL_MS=5000`
   - `WORKER_BATCH_SIZE=10`
3. O Easypanel construirá o contêiner usando o `Dockerfile` e manterá o processo em execução com reinicialização automática (`restart: unless-stopped`).
