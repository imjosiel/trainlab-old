import { calcularStreak } from './streak';

/**
 * A regra de "o que conta como sequência" tem casos de borda que merecem teste
 * sem banco. O que precisa de banco é a ORDENAÇÃO — e essa é a query, coberta
 * pelo e2e (A12/D28).
 *
 * Nota importante sobre estes testes: a função NÃO exige entrada ordenada, ela
 * ordena por dentro. Isso é de propósito e é testado abaixo — se ela dependesse
 * da ordem de chegada, o defeito do A12 poderia reaparecer aqui em vez de na query.
 */
describe('calcularStreak', () => {
  /** Data às 9h, `n` dias atrás. */
  const diasAtras = (n: number): Date => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(9, 0, 0, 0);
    return d;
  };

  it('sem nenhuma data → 0', () => {
    expect(calcularStreak([])).toBe(0);
  });

  it('só nulls → 0', () => {
    expect(calcularStreak([null, null, null])).toBe(0);
  });

  it('treino hoje → 1', () => {
    expect(calcularStreak([diasAtras(0)])).toBe(1);
  });

  it('treino ontem → 1 (o dia de hoje ainda não terminou)', () => {
    expect(calcularStreak([diasAtras(1)])).toBe(1);
  });

  it('treino anteontem, nada depois → 0', () => {
    expect(calcularStreak([diasAtras(2)])).toBe(0);
  });

  it('7 dias consecutivos até hoje → 7', () => {
    expect(calcularStreak([0, 1, 2, 3, 4, 5, 6].map(diasAtras))).toBe(7);
  });

  it('7 dias consecutivos terminando ontem → 7', () => {
    expect(calcularStreak([1, 2, 3, 4, 5, 6, 7].map(diasAtras))).toBe(7);
  });

  it('lacuna interrompe a contagem, e o que vem antes não conta', () => {
    // hoje, ontem, [falta -2], -3, -4, -5
    expect(calcularStreak([0, 1, 3, 4, 5].map(diasAtras))).toBe(2);
  });

  it('várias sessões no mesmo dia contam como um dia', () => {
    const hoje = diasAtras(0);
    const maisTarde = new Date(hoje);
    maisTarde.setHours(19);
    const ontem = diasAtras(1);

    expect(calcularStreak([hoje, maisTarde, ontem])).toBe(2);
  });

  it('ignora nulls misturados com datas válidas', () => {
    expect(calcularStreak([null, diasAtras(0), null, diasAtras(1)])).toBe(2);
  });

  // Esta é a que importa: se a função dependesse da ordem de chegada, ela
  // herdaria a fragilidade que o A12 explorou na query.
  it('não depende da ordem de chegada', () => {
    const dias = [0, 1, 2, 3].map(diasAtras);
    const embaralhado = [dias[2], dias[0], dias[3], dias[1]];

    expect(calcularStreak(embaralhado)).toBe(4);
    expect(calcularStreak([...dias].reverse())).toBe(4);
  });

  it('treino muito antigo sozinho → 0, mesmo sendo uma sequência longa', () => {
    // 30 dias seguidos, mas terminando há 10 dias: a sequência já quebrou.
    const antigos = Array.from({ length: 30 }, (_, i) => diasAtras(10 + i));
    expect(calcularStreak(antigos)).toBe(0);
  });

  /**
   * Estes só existem porque `referencia` é injetável: sem escolher o "hoje", a
   * virada de mês e a de ano só seriam exercitadas no dia em que caíssem.
   */
  describe('viradas de calendário (com "hoje" escolhido pelo teste)', () => {
    /** Dias consecutivos terminando em `fim`, do mais recente para o mais antigo. */
    const consecutivosAte = (fim: Date, quantos: number): Date[] =>
      Array.from({ length: quantos }, (_, i) => {
        const d = new Date(fim);
        d.setDate(fim.getDate() - i);
        return d;
      });

    it('conta através da virada de mês', () => {
      const hoje = new Date(2026, 2, 2, 9, 0, 0, 0); // 2 de março
      // 2/mar, 1/mar, 28/fev, 27/fev, 26/fev
      expect(calcularStreak(consecutivosAte(hoje, 5), hoje)).toBe(5);
    });

    it('conta através da virada de ano', () => {
      const hoje = new Date(2026, 0, 2, 9, 0, 0, 0); // 2 de janeiro
      // 2/jan/2026, 1/jan/2026, 31/dez/2025, 30/dez/2025
      expect(calcularStreak(consecutivosAte(hoje, 4), hoje)).toBe(4);
    });

    it('conta através de 29 de fevereiro em ano bissexto', () => {
      const hoje = new Date(2028, 2, 1, 9, 0, 0, 0); // 1 de março de 2028
      // 1/mar, 29/fev, 28/fev
      expect(calcularStreak(consecutivosAte(hoje, 3), hoje)).toBe(3);
    });

    // Horário de verão muda o comprimento do dia em milissegundos, e o cálculo
    // compara meia-noite local com meia-noite local — é o que torna a subtração
    // de 86.400.000 correta apesar do dia de 23h.
    it('não quebra em fuso com horário de verão', () => {
      const hoje = new Date(2026, 9, 20, 9, 0, 0, 0);
      expect(calcularStreak(consecutivosAte(hoje, 10), hoje)).toBe(10);
    });
  });
});
