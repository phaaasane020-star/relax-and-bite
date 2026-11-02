// Dish choices ("Choose your protein", "Extras"): one set of rules used by
// the vendor's menu editor in the browser and again on the server.
import type { OptionGroup } from '../data/types';

export const OPTION_LIMITS = {
  groups: 8,
  choices: 15,
  name: 40,
  maxPrice: 1000,
};

/**
 * Tidies and checks what the vendor entered. Throws a plain-English message
 * for the first problem found, otherwise returns clean groups.
 */
export function cleanOptions(raw: unknown): OptionGroup[] {
  if (raw === null || raw === undefined || raw === '') return [];
  if (!Array.isArray(raw)) throw new Error('The dish choices could not be read. Try again.');
  if (raw.length > OPTION_LIMITS.groups) throw new Error(`A dish can have up to ${OPTION_LIMITS.groups} choice groups.`);

  const seenGroups = new Set<string>();
  return raw.map((g, gi) => {
    const group = (g ?? {}) as Partial<OptionGroup>;
    const name = String(group.name ?? '').trim().slice(0, OPTION_LIMITS.name);
    const label = name ? `"${name}"` : `choice group ${gi + 1}`;
    if (!name) throw new Error(`Give choice group ${gi + 1} a name, for example "Choose your protein".`);
    if (seenGroups.has(name.toLowerCase())) throw new Error(`Two choice groups are called "${name}". Give each one its own name.`);
    seenGroups.add(name.toLowerCase());

    const list = Array.isArray(group.choices) ? group.choices : [];
    if (list.length === 0) throw new Error(`Add at least one choice to ${label}.`);
    if (list.length > OPTION_LIMITS.choices) throw new Error(`${label} can have up to ${OPTION_LIMITS.choices} choices.`);

    const seenChoices = new Set<string>();
    const choices = list.map((c, ci) => {
      const cname = String(c?.name ?? '').trim().slice(0, OPTION_LIMITS.name);
      if (!cname) throw new Error(`Choice ${ci + 1} in ${label} needs a name.`);
      if (seenChoices.has(cname.toLowerCase())) throw new Error(`"${cname}" appears twice in ${label}.`);
      seenChoices.add(cname.toLowerCase());
      const price = Number(c?.price ?? 0);
      if (!Number.isFinite(price) || price < 0) throw new Error(`The extra price for "${cname}" can't be below GH₵ 0.`);
      if (price > OPTION_LIMITS.maxPrice) throw new Error(`The extra price for "${cname}" looks too high.`);
      return { name: cname, price: Math.round(price * 100) / 100 };
    });

    const max = Math.round(Number(group.max ?? 1));
    if (!(max >= 1)) throw new Error(`Customers must be able to pick at least 1 in ${label}.`);
    if (max > choices.length) {
      throw new Error(`${label} lets customers pick up to ${max}, but it only has ${choices.length} ${choices.length === 1 ? 'choice' : 'choices'}.`);
    }

    return { name, required: Boolean(group.required), max, choices };
  });
}

/** How the rule reads to the customer, e.g. "Required" or "Optional, up to 3". */
export function optionRuleLabel(group: Pick<OptionGroup, 'required' | 'max'>): string {
  if (group.required) return group.max > 1 ? `Required, up to ${group.max}` : 'Required';
  return group.max > 1 ? `Optional, up to ${group.max}` : 'Optional';
}
