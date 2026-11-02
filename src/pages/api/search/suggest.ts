import type { APIRoute } from 'astro';
import { json } from '../../../lib/http';
import { searchSuggestions } from '../../../data/store';
import { getLocation } from '../../../lib/session';

// Matches while typing in Search (dishes and places in the customer's town).
export const GET: APIRoute = async ({ url, cookies }) => {
  const q = url.searchParams.get('q') ?? '';
  try {
    return json(await searchSuggestions(q, getLocation(cookies)?.zoneId));
  } catch {
    return json({ dishes: [], places: [], error: true }, 503);
  }
};
