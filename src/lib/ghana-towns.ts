// Towns and cities across Ghana, so a typed place we don't deliver to yet can
// be spotted ("Kumasi") and the person told straight away.
// Our own delivery towns come from the database; this list is only for spotting others.
export const GHANA_TOWNS = [
  'Accra', 'Tema', 'Kasoa', 'Madina', 'Adenta', 'Ashaiman', 'Dodowa', 'Nsawam', 'Weija', 'Teshie', 'Nungua', 'Spintex',
  'Kumasi', 'Obuasi', 'Ejisu', 'Konongo', 'Mampong', 'Bekwai', 'Offinso', 'Agogo', 'Ejura',
  'Cape Coast', 'Elmina', 'Winneba', 'Swedru', 'Agona Swedru', 'Saltpond', 'Mankessim', 'Dunkwa', 'Twifo Praso', 'Assin Fosu',
  'Foso', 'Ajumako', 'Apam', 'Odoben', 'Brakwa', 'Asikuma', 'Breman', 'Anomabo', 'Abura Dunkwa', 'Kasoa',
  'Sekondi', 'Takoradi', 'Tarkwa', 'Prestea', 'Bogoso', 'Axim', 'Half Assini', 'Shama', 'Nsuaem', 'Huni Valley', 'Aboso', 'Damang',
  'Wassa Akropong', 'Asankragwa', 'Sefwi Wiawso', 'Bibiani', 'Enchi', 'Juaboso',
  'Koforidua', 'Nkawkaw', 'Akim Oda', 'Oda', 'Kade', 'Suhum', 'Somanya', 'Akosombo', 'Begoro', 'Asamankese', 'Mpraeso', 'Aburi',
  'Ho', 'Hohoe', 'Keta', 'Aflao', 'Kpando', 'Sogakope', 'Anloga', 'Akatsi',
  'Sunyani', 'Techiman', 'Berekum', 'Dormaa Ahenkro', 'Wenchi', 'Kintampo', 'Goaso', 'Duayaw Nkwanta',
  'Tamale', 'Yendi', 'Savelugu', 'Bolgatanga', 'Bawku', 'Navrongo', 'Wa', 'Lawra', 'Tumu', 'Damongo', 'Salaga', 'Nalerigu', 'Dambai',
];

const clean = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The town named in what someone typed, if any. Longer names are checked
 * first, so "Agona Swedru" wins over "Swedru".
 */
export function townIn(text: string, extra: string[] = []): string | null {
  const words = ` ${clean(text)} `;
  if (words.trim().length < 3) return null;
  const names = [...new Set([...extra, ...GHANA_TOWNS])].sort((a, b) => b.length - a.length);
  return names.find((n) => words.includes(` ${clean(n)} `)) ?? null;
}
