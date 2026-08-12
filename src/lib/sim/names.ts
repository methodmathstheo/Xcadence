import { RNG } from "@/lib/rng";

/**
 * Fully synthetic artist names. Nothing here is scraped, sampled or derived
 * from a real artist, label or catalogue — the universe is invented.
 */

const ADJ = [
  "Velvet", "Hollow", "Paper", "Glass", "Neon", "Quiet", "Bitter", "Golden",
  "Static", "Lunar", "Crimson", "Iron", "Soft", "Wild", "Pale", "Electric",
  "Slow", "Midnight", "Cobalt", "Feral", "Marble", "Salt", "Amber", "Hazy",
  "Distant", "Copper", "Blunt", "Silver", "Vacant", "Tidal", "Frayed", "Plastic",
];

const NOUN = [
  "Harbour", "Signal", "Cathedral", "Motel", "Orchard", "Ledger", "Antenna",
  "Chapel", "Tundra", "Corridor", "Lantern", "Furnace", "Meridian", "Basin",
  "Pylon", "Aviary", "Cassette", "Terrace", "Quarry", "Almanac", "Beacon",
  "Riptide", "Foundry", "Prism", "Alcove", "Monsoon", "Trellis", "Bastion",
];

const PLURAL = [
  "Hounds", "Lanterns", "Vultures", "Divers", "Machines", "Cartographers",
  "Sirens", "Sleepers", "Arcades", "Wolves", "Tourists", "Saints", "Pilots",
  "Mirrors", "Gardens", "Comets", "Tenants", "Bells", "Radios", "Ghosts",
];

const FIRST = [
  "Mira", "Cass", "Juno", "Ezra", "Nova", "Wren", "Thea", "Kai", "Isla", "Rune",
  "Sol", "Nyx", "Odessa", "Ilya", "Marlowe", "Sable", "Otto", "Vesper", "Lior",
  "Anouk", "Rhea", "Dev", "Nico", "Halle", "Emmet", "Zuri", "Bo", "Ines",
  "Tallis", "Yuna", "Faro", "Ivo", "Selah", "Rook", "Noor", "Alba",
];

const LAST = [
  "Vance", "Okonjo", "Marsh", "Delacroix", "Ito", "Ferreira", "Halloran",
  "Nakamura", "Osei", "Beaumont", "Vasquez", "Lindqvist", "Amari", "Chandra",
  "Kowal", "Ferrante", "Bright", "Nwosu", "Sandoval", "Petrov", "Achebe",
  "Moreau", "Kessler", "Rai", "Solberg", "Duarte", "Farrow", "Adeyemi",
];

const STEM = [
  "lume", "vex", "orla", "sonn", "kir", "aza", "mor", "delt", "nyra", "quill",
  "sabl", "tund", "vior", "hexa", "ombr", "priv", "cael", "juri", "noct", "yarn",
];
const TAIL = ["a", "o", "is", "en", "ix", "ae", "us", "i", "yn", "ova"];

export const GENRES = [
  "bedroom pop", "drill", "hyperpop", "afrobeats", "indie folk", "amapiano",
  "shoegaze", "trap soul", "neo-soul", "post-punk", "ambient", "jersey club",
  "reggaeton", "dream pop", "grime", "alt-R&B", "corrido", "jungle",
  "sertanejo", "phonk", "emo rap", "baile funk", "synthwave", "gospel rap",
];

export function generateNames(rng: RNG, count: number): string[] {
  const out = new Set<string>();
  let guard = 0;
  while (out.size < count && guard++ < count * 50) {
    const shape = rng.int(0, 5);
    let name: string;
    switch (shape) {
      case 0:
        name = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
        break;
      case 1:
        name = `The ${rng.pick(ADJ)} ${rng.pick(PLURAL)}`;
        break;
      case 2:
        name = `${rng.pick(ADJ)} ${rng.pick(NOUN)}`;
        break;
      case 3:
        name = `${rng.pick(STEM)}${rng.pick(TAIL)}`.toUpperCase();
        break;
      case 4:
        name = `${rng.pick(FIRST)} & the ${rng.pick(PLURAL)}`;
        break;
      default:
        name = `${rng.pick(NOUN)} ${rng.pick(NOUN)}`;
        break;
    }
    out.add(name);
  }
  return [...out];
}
