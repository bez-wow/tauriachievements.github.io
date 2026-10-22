import { GuildAnalysisPlayer } from './guild-analysis';
import { LEGION_SPECS } from '../../game/wow-specs';

export interface ArtifactSpecTraits {
  spec: string;
  icon?: string;
  traits: number | null;
}

type ArtifactPlayer = Pick<GuildAnalysisPlayer, 'class' | 'specialization' | 'artifactTraits' | 'artifacts'>;

export function artifactSpecTraits(player: ArtifactPlayer): ArtifactSpecTraits[] {
  const classSpecs = LEGION_SPECS.filter((definition) => definition.classId === player.class);
  const iconFor = (spec: string) => classSpecs.find((definition) => definition.spec === spec)?.icon;
  const specOrder = (spec: string) => {
    const index = classSpecs.findIndex((definition) => definition.spec === spec);
    return index === -1 ? classSpecs.length : index;
  };

  if (!player.artifacts) {
    const spec = player.specialization?.trim();
    return spec && player.artifactTraits !== null && player.artifactTraits !== undefined
      ? [{ spec, icon: iconFor(spec), traits: player.artifactTraits }]
      : [];
  }

  const owned = [...player.artifacts]
    .sort((left, right) =>
      right.traits - left.traits || specOrder(left.specialization) - specOrder(right.specialization))
    .map((artifact) => ({
      spec: artifact.specialization,
      icon: iconFor(artifact.specialization),
      traits: artifact.traits
    }));
  const ownedSpecs = new Set(owned.map((entry) => entry.spec));
  const locked = classSpecs
    .filter((definition) => !ownedSpecs.has(definition.spec))
    .map((definition) => ({
      spec: definition.spec,
      icon: definition.icon,
      traits: null
    }));

  return [...owned, ...locked];
}
