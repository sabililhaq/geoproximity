import { distanceKm, type Coord, type RouteError } from './geo';

export type PeerLeg = {
  originId: string;
  km: number;
  durationSec?: number;
  geometry?: Array<[number, number]>;
  error?: RouteError;
};

export type RankedCandidate<T extends { id: string }> = T & {
  /** Worst peer: max km, or max duration when ranking by time. */
  km: number;
  durationSec?: number;
  totalKm: number;
  totalDurationSec?: number;
  farthestOriginId: string | null;
  peers: PeerLeg[];
  error?: RouteError;
};

type Origin = Coord & { id: string };
type Candidate = Coord & { id: string };

export function peerMapKey(originId: string, candidateId: string): string {
  return `${originId}|${candidateId}`;
}

export function compareRanked(
  a: Pick<RankedCandidate<{ id: string }>, 'km' | 'durationSec' | 'totalKm' | 'totalDurationSec'>,
  b: Pick<RankedCandidate<{ id: string }>, 'km' | 'durationSec' | 'totalKm' | 'totalDurationSec'>,
  byTime: boolean,
): number {
  if (byTime) {
    const at =
      typeof a.durationSec === 'number' && Number.isFinite(a.durationSec)
        ? a.durationSec
        : Infinity;
    const bt =
      typeof b.durationSec === 'number' && Number.isFinite(b.durationSec)
        ? b.durationSec
        : Infinity;
    if (at !== bt) return at - bt;
    const aTotal =
      typeof a.totalDurationSec === 'number' && Number.isFinite(a.totalDurationSec)
        ? a.totalDurationSec
        : Infinity;
    const bTotal =
      typeof b.totalDurationSec === 'number' && Number.isFinite(b.totalDurationSec)
        ? b.totalDurationSec
        : Infinity;
    if (aTotal !== bTotal) return aTotal - bTotal;
  }
  const ak = Number.isFinite(a.km) ? a.km : Infinity;
  const bk = Number.isFinite(b.km) ? b.km : Infinity;
  if (ak !== bk) return ak - bk;
  const aTotalKm = Number.isFinite(a.totalKm) ? a.totalKm : Infinity;
  const bTotalKm = Number.isFinite(b.totalKm) ? b.totalKm : Infinity;
  return aTotalKm - bTotalKm;
}

function scoreCandidate<T extends Candidate>(
  candidate: T,
  origins: Origin[],
  legs: Map<string, PeerLeg> | undefined,
  byTime: boolean,
): RankedCandidate<T> {
  const peers: PeerLeg[] = origins.map((origin) => {
    const cached = legs?.get(peerMapKey(origin.id, candidate.id));
    if (cached) return { ...cached, originId: origin.id };
    return { originId: origin.id, km: distanceKm(origin, candidate) };
  });

  let farthestOriginId: string | null = null;
  let worstKm = Number.NaN;
  let worstDuration = Number.NaN;
  let totalKm = 0;
  let totalDuration = 0;
  let durationCount = 0;
  let error: RouteError | undefined;

  for (const peer of peers) {
    if (peer.error && !error) error = peer.error;
    if (Number.isFinite(peer.km)) totalKm += peer.km;
    if (typeof peer.durationSec === 'number' && Number.isFinite(peer.durationSec)) {
      totalDuration += peer.durationSec;
      durationCount += 1;
    }
    const peerWorst = byTime
      ? typeof peer.durationSec === 'number' && Number.isFinite(peer.durationSec)
        ? peer.durationSec
        : Infinity
      : Number.isFinite(peer.km)
        ? peer.km
        : Infinity;
    const currentWorst = byTime
      ? Number.isFinite(worstDuration)
        ? worstDuration
        : -Infinity
      : Number.isFinite(worstKm)
        ? worstKm
        : -Infinity;
    if (peerWorst >= currentWorst) {
      farthestOriginId = peer.originId;
      worstKm = peer.km;
      worstDuration =
        typeof peer.durationSec === 'number' && Number.isFinite(peer.durationSec)
          ? peer.durationSec
          : Number.NaN;
    }
  }

  return {
    ...candidate,
    km: worstKm,
    durationSec: Number.isFinite(worstDuration) ? worstDuration : undefined,
    totalKm,
    totalDurationSec:
      durationCount === peers.length && peers.length > 0 ? totalDuration : undefined,
    farthestOriginId,
    peers,
    error,
  };
}

/** Rank candidates by the unlucky peer, then by total travel. */
export function rankCandidates<T extends Candidate>(
  candidates: T[],
  origins: Origin[],
  legs?: Map<string, PeerLeg>,
  byTime = false,
): RankedCandidate<T>[] {
  if (origins.length === 0) {
    return candidates.map((candidate) => ({
      ...candidate,
      km: Number.NaN,
      totalKm: Number.NaN,
      farthestOriginId: null,
      peers: [],
    }));
  }
  return candidates
    .map((candidate) => scoreCandidate(candidate, origins, legs, byTime))
    .sort((a, b) => compareRanked(a, b, byTime));
}
