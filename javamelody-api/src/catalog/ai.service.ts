import { Injectable, Logger } from '@nestjs/common';
import { CatalogEntry, AiAnalysis } from './catalog.schema';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey  = process.env.ANTHROPIC_API_KEY || '';
  private readonly model   = 'claude-sonnet-4-20250514';

  async analyze(entry: Partial<CatalogEntry>): Promise<AiAnalysis> {
    if (!this.apiKey) {
      throw new Error('ANTHROPIC_API_KEY não configurada');
    }

    const prompt = this.buildPrompt(entry);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      this.model,
        max_tokens: 1024,
        system: `Você é um especialista em diagnóstico de aplicações Java corporativas.
Analisa stack traces e erros de sistemas em produção para ajudar desenvolvedores a resolver problemas rapidamente.
Responda SEMPRE em JSON válido, sem markdown, sem texto fora do JSON.`,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API retornou ${response.status}: ${err}`);
    }

    const data = await response.json() as any;
    const text  = data.content?.[0]?.text || '';

    // Remove possíveis backticks se o modelo os incluir mesmo com instrução
    const clean = text.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(clean);

    return {
      probableCause:  parsed.probableCause  || 'Não identificado',
      suggestedFixes: Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes : [],
      severity:       this.normalizeSeverity(parsed.severity),
      category:       parsed.category || 'General',
      context:        parsed.context  || '',
      analyzedAt:     new Date(),
      model:          this.model,
    };
  }

  private buildPrompt(entry: Partial<CatalogEntry>): string {
    return `Analise o seguinte erro de uma aplicação Java em produção e responda SOMENTE com JSON.

**Contexto:**
- Sistema: ${entry.clientName}
- URI afetada: ${entry.uri}
- Tipo da exceção: ${entry.exceptionType}
- Status HTTP: ${entry.statusHttp}
- Mensagem: ${entry.errorMessage || 'não disponível'}
- Ocorrências: ${entry.occurrences}
- Primeira vez: ${entry.firstSeenAt?.toISOString()}
- Última vez: ${entry.lastSeenAt?.toISOString()}

**Stack trace:**
\`\`\`
${(entry.stackTrace || 'não disponível').substring(0, 3000)}
\`\`\`

Responda SOMENTE com este JSON (sem markdown):
{
  "probableCause": "explicação clara em português da causa raiz provável",
  "suggestedFixes": [
    "passo 1 concreto para investigar/resolver",
    "passo 2 concreto",
    "passo 3 concreto"
  ],
  "severity": "low|medium|high|critical",
  "category": "uma das categorias: Database|Memory|Network|BusinessLogic|Configuration|Authentication|Timeout|NullReference|Other",
  "context": "informações de contexto relevantes para o desenvolvedor (frameworks, versões, padrões comuns)"
}`;
  }

  private normalizeSeverity(v: string): AiAnalysis['severity'] {
    const map: Record<string, AiAnalysis['severity']> = {
      low: 'low', medium: 'medium', high: 'high', critical: 'critical',
    };
    return map[v?.toLowerCase()] || 'medium';
  }
}
