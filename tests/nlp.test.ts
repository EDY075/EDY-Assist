import { describe, expect, it } from 'vitest';
import { formatInTimeZone } from 'date-fns-tz';
import { parseCommand } from '../server/services/nlp.js';

const now = new Date('2026-08-24T15:00:00.000Z');

describe('parser pt-BR', () => {
  it('interpreta aula no próximo sábado', () => {
    const command = parseCommand('Me lembre da aula de Power BI sábado às 9h.', 'America/Sao_Paulo', now);
    expect(command.type).toBe('CREATE_REMINDER');
    if (command.type !== 'CREATE_REMINDER') return;
    expect(command.title).toBe('aula de Power BI');
    expect(command.category).toBe('CLASS');
    expect(formatInTimeZone(command.dueAt!, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm')).toBe('2026-08-29 09:00');
  });

  it('interpreta publicação e horário', () => {
    const command = parseCommand('Marque o post do EDY RECON para terça às 12h.', 'America/Sao_Paulo', now);
    expect(command.type).toBe('CREATE_REMINDER');
    if (command.type !== 'CREATE_REMINDER') return;
    expect(command.title).toBe('post do EDY RECON');
    expect(command.category).toBe('PUBLICATION');
  });

  it('pede confirmação quando não há data', () => {
    const command = parseCommand('Me lembre de entregar o trabalho às 14h.', 'America/Sao_Paulo', now);
    expect(command.type).toBe('CREATE_REMINDER');
    if (command.type !== 'CREATE_REMINDER') return;
    expect(command.dueAt).toBeUndefined();
    expect(command.needsConfirmation).toContain('data exata');
  });

  it('interpreta foco, trilha e matéria', () => {
    const command = parseCommand('Iniciar foco de 60 minutos estudando matemática para o ENEM.', 'America/Sao_Paulo', now);
    expect(command).toMatchObject({ type: 'START_FOCUS', durationMinutes: 60, subject: 'matemática', track: 'ENEM' });
  });

  it('interpreta desempenho e ações de agenda', () => {
    expect(parseCommand('Registre 20 questões e 15 acertos.', 'America/Sao_Paulo', now)).toMatchObject({ type: 'LOG_STUDY', questions: 20, correctAnswers: 15 });
    expect(parseCommand('Adie esse lembrete por 15 minutos.', 'America/Sao_Paulo', now)).toMatchObject({ type: 'REMINDER_ACTION', action: 'SNOOZE', minutes: 15 });
    expect(parseCommand('O que tenho hoje?', 'America/Sao_Paulo', now)).toMatchObject({ type: 'AGENDA_QUERY', period: 'TODAY' });
    expect(parseCommand('oq tenho hoje?', 'America/Sao_Paulo', now)).toMatchObject({ type: 'AGENDA_QUERY', period: 'TODAY' });
  });

  it('entende os novos atalhos mobile de rotina e estudos', () => {
    expect(parseCommand('Tenho algo a mais hoje além do que já estava marcado?', 'America/Sao_Paulo', now)).toMatchObject({ type: 'AGENDA_QUERY', period: 'TODAY' });
    expect(parseCommand('O que tenho amanhã?', 'America/Sao_Paulo', now)).toMatchObject({ type: 'AGENDA_QUERY', period: 'TOMORROW' });
    expect(parseCommand('Qual matéria devo estudar agora?', 'America/Sao_Paulo', now)).toMatchObject({ type: 'STUDY_SUGGESTION' });
    expect(parseCommand('Quais revisões estão atrasadas?', 'America/Sao_Paulo', now)).toMatchObject({ type: 'REVIEW_QUERY' });
    expect(parseCommand('Estudei Linux por uma hora.', 'America/Sao_Paulo', now)).toMatchObject({ type: 'LOG_STUDY', subject: 'Linux', track: 'LINUX', durationMinutes: 60 });
    expect(parseCommand('Fiz 20 questões e acertei 15.', 'America/Sao_Paulo', now)).toMatchObject({ type: 'LOG_STUDY', questions: 20, correctAnswers: 15 });
    expect(parseCommand('Adicione academia hoje às 19h.', 'America/Sao_Paulo', now)).toMatchObject({ type: 'CREATE_REMINDER', title: 'academia' });
    expect(parseCommand('Iniciar foco de 50 minutos.', 'America/Sao_Paulo', now)).toMatchObject({ type: 'START_FOCUS', durationMinutes: 50 });
    const ambiguous = parseCommand('Marque uma hora de Redes para hoje.', 'America/Sao_Paulo', now);
    expect(ambiguous.type).toBe('CREATE_REMINDER');
    if (ambiguous.type === 'CREATE_REMINDER') expect(ambiguous.needsConfirmation).toContain('horário exato');
  });

  it('interpreta os comandos completos da PWA móvel', () => {
    expect(parseCommand('Começar estudo de Linux por 50 minutos.', 'America/Sao_Paulo', now)).toMatchObject({ type: 'START_FOCUS', durationMinutes: 50, subject: 'Linux', track: 'LINUX' });
    expect(parseCommand('Qual assunto está com menor aproveitamento?', 'America/Sao_Paulo', now)).toMatchObject({ type: 'PERFORMANCE_QUERY' });
    const delayed = parseCommand('Me lembre de beber 250 ml de água depois de uma hora.', 'America/Sao_Paulo', now);
    expect(delayed.type).toBe('CREATE_REMINDER');
    if (delayed.type === 'CREATE_REMINDER') expect(delayed.dueAt?.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
    const rescheduled = parseCommand('Adie essa tarefa para amanhã às 14 horas.', 'America/Sao_Paulo', now);
    expect(rescheduled.type).toBe('REMINDER_ACTION');
    if (rescheduled.type === 'REMINDER_ACTION') expect(rescheduled.action).toBe('RESCHEDULE');
  });
});
