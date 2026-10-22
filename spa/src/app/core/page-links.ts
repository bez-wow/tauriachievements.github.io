import { realmSlug } from '../game/wow';

export function mythicPlusProfileLink(character: { readonly name: string; readonly realm: string }): string[] {
  return ['/mythic-plus', 'character', realmSlug(character.realm), character.name];
}
