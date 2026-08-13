/**
 * Porte de DEFAULT_SPORTS de apps/web/lib/constants.ts.
 *
 * Duplicado de proposito, mesmo critério das constantes de role: o backend nao
 * importa de dentro do app Next. Usado no merge de posicoes do GET publico
 * (D12) e no syncDefaults (D13).
 */

export const DEFAULT_SPORTS = [
  { slug: 'soccer',            name: 'Futebol',           positions: ['Goleiro', 'Zagueiro', 'Lateral Direito', 'Lateral Esquerdo', 'Volante', 'Meia', 'Ponta', 'Atacante'] },
  { slug: 'futsal',            name: 'Futsal',            positions: ['Goleiro', 'Fixo', 'Ala Direita', 'Ala Esquerda', 'Pivô'] },
  { slug: 'basketball',        name: 'Basquete',          positions: ['Armador', 'Ala-armador', 'Ala', 'Ala-pivô', 'Pivô'] },
  { slug: 'volleyball',        name: 'Vôlei',             positions: ['Líbero', 'Levantador', 'Ponteiro', 'Oposto', 'Central'] },
  { slug: 'beach-volley',      name: 'Vôlei de Praia',    positions: ['Atacante', 'Defensor'] },
  { slug: 'tennis',            name: 'Tênis',             positions: ['Simples', 'Duplas'] },
  { slug: 'swimming',          name: 'Natação',           positions: ['Crawl', 'Costas', 'Peito', 'Borboleta', 'Medley'] },
  { slug: 'athletics',         name: 'Atletismo',         positions: ['Velocista', 'Meio-fundista', 'Fundista', 'Saltador', 'Arremessador'] },
  { slug: 'martial-arts',      name: 'Artes Marciais',    positions: ['Faixa Branca', 'Faixa Azul', 'Faixa Roxa', 'Faixa Marrom', 'Faixa Preta'] },
  { slug: 'gym',               name: 'Musculação',        positions: ['Iniciante', 'Intermediário', 'Avançado'] },
  { slug: 'running',           name: 'Corrida',           positions: ['5k', '10k', 'Meia Maratona', 'Maratona', 'Ultra'] },
  { slug: 'cycling',           name: 'Ciclismo',          positions: ['Speed', 'Mountain Bike', 'BMX', 'Pista'] },
  { slug: 'handball',          name: 'Handebol',          positions: ['Goleiro', 'Ponta', 'Meia', 'Pivô'] },
  { slug: 'american-football', name: 'Futebol Americano', positions: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'] },
] as const

export type SportSlug = (typeof DEFAULT_SPORTS)[number]['slug'];

/** Indexado slug -> positions, para o merge do GET publico nao varrer a lista. */
export const POSITIONS_BY_SLUG: Record<string, string[]> = {};
for (const sport of DEFAULT_SPORTS) {
  POSITIONS_BY_SLUG[sport.slug] = [...sport.positions];
}
