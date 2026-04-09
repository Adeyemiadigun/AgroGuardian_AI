type HerdAdviceArgs = {
  species: string;
  likelyCondition?: string;
};

const norm = (v: unknown) => String(v || '').trim().toLowerCase();

const includesAny = (hay: string, needles: string[]) => needles.some((n) => hay.includes(n));

/**
 * Returns safe, non-dosage preventive guidance for uninfected animals in the same flock/herd.
 * This is intentionally conservative: it only suggests common vaccines where applicable, otherwise
 * it explicitly states that no vaccine is available and focuses on isolation/biosecurity.
 */
export const getHerdPreventionAdvice = (args: HerdAdviceArgs): string[] => {
  const species = norm(args.species);
  const cond = norm(args.likelyCondition);

  const advice: string[] = [];

  // Always start with isolation/biosecurity framing (farmer-friendly)
  advice.push('Protect the uninfected animals: isolate the sick, separate equipment/boots, disinfect housing, and limit movement between pens.');

  if (species === 'poultry') {
    if (includesAny(cond, ['newcastle', 'nd'])) {
      advice.push('If this is suspected Newcastle disease and the flock is not fully vaccinated, discuss emergency vaccination of the UNINFECTED birds with a vet/extension officer (follow label/local schedule).');
    } else if (includesAny(cond, ['gumboro', 'ibd', 'infectious bursal'])) {
      advice.push('If this is suspected Gumboro/IBD and the flock is not vaccinated, discuss vaccinating the UNINFECTED birds with a vet (follow local schedule).');
    } else if (includesAny(cond, ['fowl pox', 'pox'])) {
      advice.push('If this is suspected fowl pox and birds are not vaccinated, discuss vaccinating the UNINFECTED birds (do not vaccinate visibly sick birds).');
    } else if (includesAny(cond, ['infectious bronchitis', 'ib '])) {
      advice.push('If this is suspected infectious bronchitis and birds are not vaccinated, discuss vaccinating the UNINFECTED birds with a vet (follow local schedule).');
    }

    return advice;
  }

  if (species === 'goat' || species === 'sheep') {
    if (includesAny(cond, ['ppr', 'peste des petits ruminants', 'peste'])) {
      advice.push('If PPR is suspected and the rest of the herd is not vaccinated, contact a vet/extension service about vaccinating the UNINFECTED animals and enforcing quarantine.');
    }
    return advice;
  }

  if (species === 'cattle') {
    if (includesAny(cond, ['foot-and-mouth', 'foot and mouth', 'fmd'])) {
      advice.push('If FMD is suspected, contact a veterinarian/authorities immediately. Vaccination policies vary—do not move animals; follow official guidance.');
    } else if (includesAny(cond, ['lumpy skin', 'lsd'])) {
      advice.push('If lumpy skin disease is suspected and animals are not vaccinated, discuss vaccinating the UNINFECTED cattle with a vet (plus vector control).');
    }
    return advice;
  }

  if (species === 'pig' || species === 'swine') {
    if (includesAny(cond, ['african swine fever', 'asf'])) {
      advice.push('African Swine Fever has no reliable vaccine in routine use—focus on strict quarantine, stop movement/sales, and contact a veterinarian/authorities.');
    }
    return advice;
  }

  // fish/rabbit/unknown: stick to biosecurity only
  return advice;
};
