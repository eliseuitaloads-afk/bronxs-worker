import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ━━━ 1. Configuration & Validation ━━━
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const intervalMs = parseInt(process.env.WORKER_INTERVAL_MS || '5000', 10);
const batchSize = parseInt(process.env.WORKER_BATCH_SIZE || '10', 10);
const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL?.trim() || null;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[worker] ERRO CRÍTICO: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.');
  console.error('[worker] Verifique as variáveis de ambiente ou o arquivo .env.');
  process.exit(1);
}

// ━━━ 2. Supabase Client (Service Role bypasses RLS) ━━━
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

console.log(`[worker] iniciado, intervalo ${intervalMs}ms, batch ${batchSize}`);

// ━━━ 3. State & Shutdown Handling ━━━
let isRunning = true;
let currentTimer = null;

function shutdown(signal) {
  console.log(`\n[worker] Recebido sinal ${signal}. Encerrando com segurança...`);
  isRunning = false;
  if (currentTimer) clearTimeout(currentTimer);
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ━━━ 4. Worker Processing Loop ━━━
async function runCycle() {
  if (!isRunning) return;

  try {
    // ━━━ Passo 1: Resgatar eventos presos em 'processing' (ex: worker anterior caiu) ━━━
    try {
      const { data: rescuedCount, error: rescueErr } = await supabase.rpc('rescue_stuck_events');
      if (rescueErr) {
        console.error('[worker] Falha ao executar rescue_stuck_events:', rescueErr.message);
      } else if (rescuedCount && Number(rescuedCount) > 0) {
        console.log(`[worker] Resgatou ${rescuedCount} evento(s) preso(s) de volta para 'pending'`);
      }
    } catch (rescueEx) {
      console.error('[worker] Exceção em rescue_stuck_events:', rescueEx?.message || rescueEx);
    }

    // ━━━ Passo 2: Reivindicar lote de eventos pendentes atomicamente ━━━
    const { data: events, error: claimErr } = await supabase.rpc('claim_events', {
      batch_size: batchSize,
    });

    if (claimErr) {
      console.error('[worker] Falha ao reivindicar eventos (claim_events):', claimErr.message);
    } else if (events && Array.isArray(events) && events.length > 0) {
      let doneCount = 0;
      let failedCount = 0;

      // ━━━ Passo 3: Processar cada evento reivindicado ━━━
      for (const event of events) {
        try {
          // ━━━ Integração n8n: Enviar evento via HTTP POST ━━━
          if (n8nWebhookUrl) {
            const res = await fetch(n8nWebhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(event),
            });

            if (!res.ok) {
              const errBody = await res.text().catch(() => '');
              throw new Error(`Falha no webhook n8n (HTTP ${res.status}): ${errBody.slice(0, 200)}`);
            }

            console.log(`[worker] evento ${event.id} enviado ao n8n (status ${res.status})`);
          } else {
            console.log('[worker] N8N_WEBHOOK_URL não configurada, pulando POST');
          }

          // Marcação de sucesso no Supabase após envio bem-sucedido
          const now = new Date().toISOString();
          const { error: doneErr } = await supabase
            .from('event_log')
            .update({
              status: 'done',
              processed_at: now,
            })
            .eq('id', event.id);

          if (doneErr) {
            throw new Error(`Falha ao marcar evento como done: ${doneErr.message}`);
          }

          doneCount++;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(`[worker] Erro ao processar evento ${event.id} (${event.event_type}):`, errorMessage);

          const nextAttempts = (event.attempts || 0) + 1;
          const maxAttempts = event.max_attempts || 5;
          const nextStatus = nextAttempts >= maxAttempts ? 'failed' : 'pending';

          await supabase
            .from('event_log')
            .update({
              status: nextStatus,
              attempts: nextAttempts,
              last_error: errorMessage,
            })
            .eq('id', event.id);

          failedCount++;
        }
      }

      // ━━━ Passo 4: Log de resumo do lote ━━━
      console.log(`[worker] ciclo: claimed=${events.length} done=${doneCount} failed=${failedCount}`);
    }
  } catch (cycleErr) {
    // ━━━ Passo 5: Resiliência total — erro no ciclo não mata o worker ━━━
    console.error('[worker] Erro inesperado no ciclo:', cycleErr?.message || cycleErr);
  } finally {
    // Agenda o próximo ciclo após conclusão do anterior (evita sobreposição)
    if (isRunning) {
      currentTimer = setTimeout(runCycle, intervalMs);
    }
  }
}

// Inicia o primeiro ciclo
runCycle();
