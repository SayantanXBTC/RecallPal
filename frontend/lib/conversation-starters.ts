import { FaceResult } from './types';

const RELATION_PROMPTS: Record<string, string[]> = {
  son:           ['How is school or work going?', 'Have you been staying healthy?'],
  daughter:      ['How is school or work going?', 'Have you been keeping well?'],
  husband:       ['How has your day been?', 'Shall we have some tea together?'],
  wife:          ['How has your day been?', 'Shall we have some tea together?'],
  partner:       ['How has your day been?', 'What shall we do today?'],
  father:        ['How are you feeling today?', 'Do you need anything from me?'],
  mother:        ['How are you feeling today?', 'Did you eat well today?'],
  brother:       ['What have you been up to lately?', 'How is everything going?'],
  sister:        ['What have you been up to lately?', 'How is everything going?'],
  grandfather:   ['How is your health today?', 'Tell me about your day.'],
  grandmother:   ['How is your health today?', 'Did you sleep well?'],
  grandson:      ['How is school?', 'What games have you been playing?'],
  granddaughter: ['How is school?', 'What have you been doing lately?'],
  friend:        ['How have you been?', "How's life treating you?"],
  neighbour:     ['How is everything in the neighbourhood?', 'Have things been quiet lately?'],
  caregiver:     ['How am I doing today?', 'Is there anything I should know?'],
  doctor:        ['Any updates on my health?', 'Should I be doing anything differently?'],
  nurse:         ['How am I doing today?', 'Any important reminders for me?'],
};

export function generateStarters(face: FaceResult): string[] {
  const starters: string[] = [];
  const mem  = face.memory;
  const name = face.name
    ? face.name.charAt(0).toUpperCase() + face.name.slice(1)
    : 'them';

  if (!mem) return [`Say hello to ${name}!`];

  // 1. From likes — pick one random interest
  if (mem.likes && mem.likes.length > 0) {
    const pick = mem.likes[Math.floor(Math.random() * mem.likes.length)];
    starters.push(`Ask about ${pick}`);
  }

  // 2. From relation — lookup contextual prompt
  const rel       = (mem.relation ?? '').toLowerCase().trim();
  const relPool   = RELATION_PROMPTS[rel];
  if (relPool && relPool.length > 0) {
    const pick = relPool[Math.floor(Math.random() * relPool.length)];
    if (!starters.includes(pick)) starters.push(pick);
  }

  // 3. From last_seen — time-aware context
  if (mem.last_seen) {
    try {
      const diffDays = Math.floor((Date.now() - new Date(mem.last_seen).getTime()) / 86_400_000);
      if (diffDays > 30) {
        starters.push(`It has been over a month since you last met!`);
      } else if (diffDays > 7) {
        starters.push(`It has been ${diffDays} days — catch up on what you missed!`);
      } else if (diffDays === 0 && starters.length < 3) {
        starters.push(`You saw ${name} earlier today.`);
      }
    } catch { /* ignore invalid date string */ }
  }

  // 4. From notes — surface first sentence if still need a starter
  if (starters.length < 3 && mem.notes && mem.notes.trim().length > 10) {
    const snippet = mem.notes.trim().split(/[.!?]/)[0].trim();
    if (snippet.length > 0 && snippet.length < 80) {
      starters.push(`Remember: "${snippet}"`);
    }
  }

  return starters.slice(0, 3);
}
