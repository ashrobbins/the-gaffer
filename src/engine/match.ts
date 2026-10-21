import { INJURY_KINDS } from './data/names';
import { MATCH, STYLE_EFFECT } from './config';
import { assignToFormation, effectiveRating, FORMATION_IDS, FORMATIONS, validateTeamSheet } from './formations';
import type {
  FormationId,
  MatchEvent,
  MatchState,
  PlayStyle,
  PlayerMatch,
  ShotOutcome,
  Side,
  SideState,
  TeamSheet,
} from './matchTypes';
import { ROLES } from './positions';
import type { Rng } from './rng';
import { teamRating } from './sim';
import type { Injury, Player, Position, World } from './types';

const SIDES: readonly Side[] = ['home', 'away'];
export const otherSide = (side: Side): Side => (side === 'home' ? 'away' : 'home');

type NewEvent = { [K in MatchEvent['kind']]: Omit<Extract<MatchEvent, { kind: K }>, 'minute' | 'side' | 'clubId' | 'variant' | 'score'> }[MatchEvent['kind']];

// ---------------------------------------------------------------------------------------------------------------
// Setting up
// ---------------------------------------------------------------------------------------------------------------

function newSide(clubId: string, sheet: TeamSheet): SideState {
  return {
    clubId,
    formation: sheet.formation,
    style: sheet.style,
    slots: [...sheet.xi],
    bench: [...sheet.bench],
    subsUsed: 0,
    subbedOff: [],
    sentOff: [],
    forcedSub: null,
  };
}

const blankPlayer = (p: Player, started: boolean): PlayerMatch => ({
  id: p.id,
  clubId: p.clubId,
  started,
  onPitch: started,
  fatigue: p.fatigue,
  minutes: 0,
  goals: 0,
  shots: 0,
  yellowCards: 0,
  redCards: 0,
  injury: null,
});

const blankStats = () => ({ shots: 0, onTarget: 0, corners: 0, fouls: 0, yellowCards: 0, redCards: 0 });

/** Starts a match from two team sheets. Nothing is played until `stepMinute` is called. */
export function createMatch(world: World, homeClubId: string, home: TeamSheet, awayClubId: string, away: TeamSheet): MatchState {
  validateTeamSheet(world, homeClubId, home);
  validateTeamSheet(world, awayClubId, away);
  const state: MatchState = {
    minute: 0,
    phase: 'first-half',
    score: [0, 0],
    sides: { home: newSide(homeClubId, home), away: newSide(awayClubId, away) },
    players: {},
    stats: { home: blankStats(), away: blankStats() },
    possession: [],
    events: [],
  };
  for (const side of SIDES) {
    const s = state.sides[side];
    for (const id of s.slots) if (id) state.players[id] = blankPlayer(world.players[id] as Player, true);
    for (const id of s.bench) state.players[id] = blankPlayer(world.players[id] as Player, false);
  }
  return state;
}

// ---------------------------------------------------------------------------------------------------------------
// Team strength
// ---------------------------------------------------------------------------------------------------------------

export interface Profile {
  /** 1 means a typical 4-4-2 of rating-70 players on a balanced style. */
  att: number;
  def: number;
  ctrl: number;
  /** The goalkeeper's effective rating, or a low figure if nobody is in goal. */
  keeper: number;
}

const BASELINE = FORMATIONS['4-4-2'].reduce(
  (sum, pos) => ({
    att: sum.att + ROLES[pos].att * 70,
    def: sum.def + ROLES[pos].def * 70,
    ctrl: sum.ctrl + ROLES[pos].ctrl * 70,
  }),
  { att: 0, def: 0, ctrl: 0 },
);

const slotPosition = (side: SideState, i: number): Position => FORMATIONS[side.formation][i] as Position;

/** The players on the pitch for a side, with the position each is playing. */
export function onPitch(world: World, state: MatchState, side: Side): { player: Player; position: Position; fatigue: number }[] {
  const s = state.sides[side];
  const out: { player: Player; position: Position; fatigue: number }[] = [];
  s.slots.forEach((id, i) => {
    if (!id) return;
    const pm = state.players[id];
    const player = world.players[id];
    if (pm && player) out.push({ player, position: slotPosition(s, i), fatigue: pm.fatigue });
  });
  return out;
}

/** How a side is playing right now: attack, defence and control, from who is on the pitch, how tired they are, and play style. */
export function teamProfile(world: World, state: MatchState, side: Side): Profile {
  const style = STYLE_EFFECT[state.sides[side].style];
  let att = 0;
  let def = 0;
  let ctrl = 0;
  let keeper = 30;
  for (const { player, position, fatigue } of onPitch(world, state, side)) {
    const eff = effectiveRating(player, position, fatigue);
    const role = ROLES[position];
    att += role.att * eff;
    def += role.def * eff;
    ctrl += role.ctrl * eff;
    if (position === 'GK') keeper = eff;
  }
  const boost = side === 'home' ? MATCH.homeBoost : 1;
  return {
    att: (att / BASELINE.att) * style.att * boost,
    def: (def / BASELINE.def) * style.def,
    ctrl: (ctrl / BASELINE.ctrl) * style.ctrl * boost,
    keeper,
  };
}

/** The home side's share of the ball, 0 to 1. */
export function possessionShare(home: Profile, away: Profile): number {
  const ratio = away.ctrl / home.ctrl;
  return 1 / (1 + Math.pow(ratio, MATCH.possessionExponent));
}

/** Chance of a player getting injured in one minute. It climbs with tiredness and sharply once he is over 80%. */
export function injuryChancePerMinute(fatigue: number, age: number): number {
  const tired = Math.pow(fatigue / 60, 2);
  const exhausted = fatigue > 80 ? (fatigue - 80) * 0.35 : 0;
  const older = Math.max(0, age - 28) * 0.02;
  return MATCH.injuryPerPlayerMinute * (1 + tired + exhausted + older);
}

// ---------------------------------------------------------------------------------------------------------------
// Playing a minute
// ---------------------------------------------------------------------------------------------------------------

const FOUL_WEIGHT: Record<Position, number> = {
  GK: 0.05, LB: 1, RB: 1, CB: 1.3, DM: 1.4, CM: 1.1, LM: 0.8, RM: 0.8, AM: 0.7, LW: 0.6, RW: 0.6, ST: 0.7,
};

function weightedPick<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T | null {
  const weights = items.map((t) => Math.max(0, weight(t)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] as number;
    if (r <= 0) return items[i] as T;
  }
  return items[items.length - 1] as T;
}

function goalkeeperOf(world: World, state: MatchState, side: Side): { id: string; eff: number } | null {
  const hit = onPitch(world, state, side).find((x) => x.position === 'GK');
  return hit ? { id: hit.player.id, eff: effectiveRating(hit.player, 'GK', hit.fatigue) } : null;
}

function mustReplaceAvailable(world: World, state: MatchState, side: Side): boolean {
  return state.sides[side].bench.some((id) => !world.players[id]?.injury && !state.players[id]?.injury);
}

export function pendingForcedSub(state: MatchState): Side | null {
  return SIDES.find((side) => state.sides[side].forcedSub !== null) ?? null;
}

/** Plays one minute of the match and returns the key moments that happened in it. */
export function stepMinute(world: World, state: MatchState, rng: Rng): MatchEvent[] {
  if (state.phase === 'full-time') throw new Error('The match is over');
  if (state.phase === 'half-time') throw new Error('Start the second half first');
  if (pendingForcedSub(state)) throw new Error('An injured player must be replaced first');

  state.minute++;
  const events: MatchEvent[] = [];
  const emit = (side: Side, e: NewEvent): void => {
    const full = {
      ...e,
      minute: state.minute,
      side,
      clubId: state.sides[side].clubId,
      variant: rng.int(0, 99),
      score: [state.score[0], state.score[1]] as [number, number],
    } as MatchEvent;
    state.events.push(full);
    events.push(full);
  };

  if (state.minute === 1) emit('home', { kind: 'kick-off' });

  const profile = { home: teamProfile(world, state, 'home'), away: teamProfile(world, state, 'away') };
  const homeShare = possessionShare(profile.home, profile.away);
  state.possession.push(homeShare);

  tire(world, state);

  const order: Side[] = rng.chance(0.5) ? ['home', 'away'] : ['away', 'home'];
  for (const side of order) {
    const share = side === 'home' ? homeShare : 1 - homeShare;
    const mine = profile[side];
    const theirs = profile[otherSide(side)];
    const rate =
      MATCH.shotBase *
      Math.pow(mine.att / theirs.def, MATCH.shotAttackExponent) *
      Math.pow(share / 0.5, MATCH.shotPossessionExponent);
    if (rng.chance(Math.min(0.9, rate))) takeShot(world, state, side, rng, emit, false);
    const cornerRate =
      MATCH.cornerRate * Math.pow(mine.att / theirs.def, MATCH.shotAttackExponent) * Math.pow(share / 0.5, MATCH.shotPossessionExponent);
    if (rng.chance(Math.min(0.5, cornerRate))) {
      state.stats[side].corners++;
      emit(side, { kind: 'corner' });
      if (rng.chance(MATCH.cornerHeaderChance)) takeShot(world, state, side, rng, emit, true);
    }
  }

  if (rng.chance(MATCH.foulRate)) foul(world, state, rng, emit, homeShare);

  for (const side of order) injuries(world, state, side, rng, emit);

  if (state.minute === MATCH.halfTime) {
    emit('home', { kind: 'half-time' });
    state.phase = 'half-time';
  } else if (state.minute === MATCH.minutes) {
    emit('home', { kind: 'full-time' });
    state.phase = 'full-time';
  }
  return events;
}

export function startSecondHalf(state: MatchState): void {
  if (state.phase !== 'half-time') throw new Error('It is not half time');
  state.phase = 'second-half';
}

function tire(world: World, state: MatchState): void {
  for (const side of SIDES) {
    const effort = STYLE_EFFECT[state.sides[side].style].effort;
    for (const { player, position } of onPitch(world, state, side)) {
      const pm = state.players[player.id] as PlayerMatch;
      const role = position === 'GK' ? 0.3 : position === 'CM' || position === 'DM' ? 1.1 : 1;
      const age = 1 + (player.age - 27) * 0.012;
      pm.fatigue = Math.min(100, pm.fatigue + MATCH.fatiguePerMinute * effort * role * age);
      pm.minutes++;
    }
  }
}

type Emit = (side: Side, e: NewEvent) => void;

function takeShot(world: World, state: MatchState, side: Side, rng: Rng, emit: Emit, header: boolean): void {
  const attackers = onPitch(world, state, side).filter((x) => x.position !== 'GK');
  const shooter = weightedPick(rng, attackers, (x) => {
    const eff = effectiveRating(x.player, x.position, x.fatigue);
    const role = header ? (x.position === 'CB' ? 0.9 : ROLES[x.position].att) : ROLES[x.position].att;
    return role * eff * eff;
  });
  if (!shooter) return;
  const foe = otherSide(side);
  const keeper = goalkeeperOf(world, state, foe);
  const pm = state.players[shooter.player.id] as PlayerMatch;
  const shooterEff = effectiveRating(shooter.player, shooter.position, shooter.fatigue);
  pm.shots++;
  state.stats[side].shots++;

  const shot = (outcome: ShotOutcome): void =>
    emit(side, { kind: 'shot', playerId: shooter.player.id, outcome, keeperId: keeper?.id ?? null });
  const corner = (): void => {
    state.stats[side].corners++;
    emit(side, { kind: 'corner' });
    if (!header && rng.chance(MATCH.cornerHeaderChance)) takeShot(world, state, side, rng, emit, true);
  };

  if (rng.chance(MATCH.blockedChance)) {
    shot('blocked');
    if (rng.chance(MATCH.cornerAfterBlock)) corner();
    return;
  }
  if (!rng.chance(MATCH.onTargetChance)) {
    const r = rng.next();
    shot(r < MATCH.postGivenOffTarget ? 'post' : r < MATCH.postGivenOffTarget + MATCH.wideGivenOffTarget ? 'wide' : 'over');
    return;
  }
  state.stats[side].onTarget++;
  const keeperEff = keeper?.eff ?? 35;
  const pGoal = Math.min(0.6, Math.max(0.05, MATCH.goalGivenOnTarget * Math.pow(shooterEff / keeperEff, 1.8)));
  if (rng.chance(pGoal)) {
    score(state, side, shooter.player.id, false);
    emit(side, { kind: 'goal', playerId: shooter.player.id, penalty: false });
    return;
  }
  shot('saved');
  if (rng.chance(MATCH.cornerAfterSave)) corner();
}

function score(state: MatchState, side: Side, playerId: string, _penalty: boolean): void {
  state.score[side === 'home' ? 0 : 1]++;
  (state.players[playerId] as PlayerMatch).goals++;
}

function foul(world: World, state: MatchState, rng: Rng, emit: Emit, homeShare: number): void {
  // The side without the ball does most of the fouling.
  const foulSide: Side = rng.chance(1 - homeShare) ? 'home' : 'away';
  const victim = otherSide(foulSide);
  const culprit = weightedPick(rng, onPitch(world, state, foulSide), (x) => FOUL_WEIGHT[x.position] * (1 + x.fatigue / 100));
  if (!culprit) return;
  state.stats[foulSide].fouls++;
  const penalty = rng.chance(MATCH.penaltyOnFoulChance);
  const pm = state.players[culprit.player.id] as PlayerMatch;

  if (rng.chance(MATCH.straightRedChance)) {
    sendOff(state, foulSide, culprit.player.id);
    emit(foulSide, { kind: 'red', playerId: culprit.player.id, reason: 'straight' });
  } else if (rng.chance(penalty ? MATCH.yellowChanceOnPenalty : MATCH.yellowChance)) {
    pm.yellowCards++;
    state.stats[foulSide].yellowCards++;
    if (pm.yellowCards >= 2) {
      sendOff(state, foulSide, culprit.player.id);
      emit(foulSide, { kind: 'red', playerId: culprit.player.id, reason: 'second-yellow' });
    } else {
      emit(foulSide, { kind: 'yellow', playerId: culprit.player.id });
    }
  }

  if (penalty) takePenalty(world, state, victim, rng, emit);
}

function takePenalty(world: World, state: MatchState, side: Side, rng: Rng, emit: Emit): void {
  const taker = weightedPick(
    rng,
    onPitch(world, state, side).filter((x) => x.position !== 'GK'),
    (x) => ROLES[x.position].att * Math.pow(effectiveRating(x.player, x.position, x.fatigue), 3),
  );
  if (!taker) return;
  const keeper = goalkeeperOf(world, state, otherSide(side));
  const takerEff = effectiveRating(taker.player, taker.position, taker.fatigue);
  const p = Math.min(0.9, Math.max(0.5, MATCH.penaltyConversion * Math.pow(takerEff / (keeper?.eff ?? 35), 0.5)));
  const pm = state.players[taker.player.id] as PlayerMatch;
  pm.shots++;
  state.stats[side].shots++;
  if (rng.chance(p)) {
    state.stats[side].onTarget++;
    score(state, side, taker.player.id, true);
    emit(side, { kind: 'goal', playerId: taker.player.id, penalty: true });
  } else {
    const saved = rng.chance(0.6);
    if (saved) state.stats[side].onTarget++;
    emit(side, { kind: 'penalty-miss', playerId: taker.player.id, saved, keeperId: saved ? (keeper?.id ?? null) : null });
  }
}

function sendOff(state: MatchState, side: Side, playerId: string): void {
  const s = state.sides[side];
  const i = s.slots.indexOf(playerId);
  if (i !== -1) s.slots[i] = null;
  s.sentOff.push(playerId);
  const pm = state.players[playerId] as PlayerMatch;
  pm.onPitch = false;
  pm.redCards++;
  state.stats[side].redCards++;
  if (s.forcedSub === playerId) s.forcedSub = null;
}

function injurySeverity(rng: Rng): number {
  const r = rng.next();
  if (r < 0.5) return rng.int(1, 2);
  if (r < 0.8) return rng.int(3, 5);
  if (r < 0.95) return rng.int(6, 10);
  return rng.int(11, 20);
}

function injuries(world: World, state: MatchState, side: Side, rng: Rng, emit: Emit): void {
  const s = state.sides[side];
  if (s.forcedSub) return;
  for (const { player, fatigue } of onPitch(world, state, side)) {
    if (!rng.chance(injuryChancePerMinute(fatigue, player.age))) continue;
    const injury: Injury = { weeks: injurySeverity(rng), kind: rng.pick(INJURY_KINDS) };
    const pm = state.players[player.id] as PlayerMatch;
    pm.injury = injury;
    const mustReplace = mustReplaceAvailable(world, state, side);
    if (mustReplace) {
      s.forcedSub = player.id;
    } else {
      const i = s.slots.indexOf(player.id);
      if (i !== -1) s.slots[i] = null;
      pm.onPitch = false;
    }
    emit(side, { kind: 'injury', playerId: player.id, injury, exhausted: fatigue > 80, mustReplace });
    return;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Changes from the manager
// ---------------------------------------------------------------------------------------------------------------

export function setStyle(state: MatchState, side: Side, style: PlayStyle): void {
  if (state.phase === 'full-time') throw new Error('The match is over');
  state.sides[side].style = style;
}

/** Swaps two players' positions on the pitch. Free, and does not use a substitution. */
export function swapSlots(state: MatchState, side: Side, a: number, b: number): void {
  const s = state.sides[side];
  if (a < 0 || b < 0 || a > 10 || b > 10) throw new Error('No such position');
  [s.slots[a], s.slots[b]] = [s.slots[b] ?? null, s.slots[a] ?? null];
}

/** Changes formation, keeping the same players on the pitch and putting each where he fits best. Free. */
export function changeFormation(world: World, state: MatchState, side: Side, formation: FormationId): void {
  if (state.phase === 'full-time') throw new Error('The match is over');
  const s = state.sides[side];
  const playing = s.slots.filter((id): id is string => id !== null);
  s.slots = assignToFormation(world, playing, formation);
  s.formation = formation;
}

/** Before kick-off the whole line-up can be changed freely, and none of it counts as a substitution. */
export function setTeamSheet(world: World, state: MatchState, side: Side, sheet: TeamSheet): void {
  if (state.minute !== 0) throw new Error('The team can only be changed freely before kick-off');
  const s = state.sides[side];
  validateTeamSheet(world, s.clubId, sheet);
  for (const id of [...s.slots, ...s.bench]) if (id) delete state.players[id];
  s.formation = sheet.formation;
  s.style = sheet.style;
  s.slots = [...sheet.xi];
  s.bench = [...sheet.bench];
  for (const id of s.slots) if (id) state.players[id] = blankPlayer(world.players[id] as Player, true);
  for (const id of s.bench) state.players[id] = blankPlayer(world.players[id] as Player, false);
}

/**
 * Replaces a player on the pitch with one from the bench. Three substitutions are allowed, but replacing an
 * injured player is always allowed. A player who has come off cannot go back on.
 */
export function makeSubstitution(world: World, state: MatchState, side: Side, offId: string, onId: string): void {
  if (state.phase === 'full-time') throw new Error('The match is over');
  const s = state.sides[side];
  const slot = s.slots.indexOf(offId);
  if (slot === -1) throw new Error('That player is not on the pitch');
  if (!s.bench.includes(onId)) throw new Error('That player is not on the bench');
  const incoming = world.players[onId];
  if (!incoming || incoming.injury) throw new Error('That player is injured');
  const forced = s.forcedSub === offId;
  if (!forced && s.subsUsed >= MATCH.maxSubs) throw new Error('No substitutions left');

  s.slots[slot] = onId;
  s.bench = s.bench.filter((id) => id !== onId);
  s.subbedOff.push(offId);
  s.subsUsed++;
  if (forced) s.forcedSub = null;
  (state.players[offId] as PlayerMatch).onPitch = false;
  (state.players[onId] as PlayerMatch).onPitch = true;

  const event = {
    kind: 'sub' as const,
    offId,
    onId,
    forced,
    minute: state.minute,
    side,
    clubId: s.clubId,
    variant: state.events.length % 100,
    score: [state.score[0], state.score[1]] as [number, number],
  };
  state.events.push(event);
}

// ---------------------------------------------------------------------------------------------------------------
// Computer-managed sides
// ---------------------------------------------------------------------------------------------------------------

/** The best bench player to bring on into a position, by how he would play there. */
function bestReplacement(world: World, state: MatchState, side: Side, position: Position): string | null {
  const s = state.sides[side];
  let best: { id: string; eff: number } | null = null;
  for (const id of s.bench) {
    const p = world.players[id];
    if (!p || p.injury) continue;
    const eff = effectiveRating(p, position, p.fatigue);
    if (!best || eff > best.eff) best = { id, eff };
  }
  return best?.id ?? null;
}

/**
 * What a computer manager does this minute: replaces an injured player, changes play style as the score and
 * the clock demand, and swaps tired players for fresh ones in the second half.
 */
export function aiManageSide(world: World, state: MatchState, side: Side, rng: Rng): void {
  if (state.phase === 'full-time') return;
  const s = state.sides[side];

  if (s.forcedSub) {
    const i = s.slots.indexOf(s.forcedSub);
    const on = bestReplacement(world, state, side, slotPosition(s, i));
    if (on) makeSubstitution(world, state, side, s.forcedSub, on);
    else {
      s.slots[i] = null;
      (state.players[s.forcedSub] as PlayerMatch).onPitch = false;
      s.forcedSub = null;
    }
    return;
  }

  const lead = side === 'home' ? state.score[0] - state.score[1] : state.score[1] - state.score[0];
  if (state.minute >= 60) {
    if (lead < 0) setStyle(state, side, state.minute >= 80 ? 'gung-ho' : 'attacking');
    else if (lead > 0 && state.minute >= 70) setStyle(state, side, state.minute >= 85 ? 'park-the-bus' : 'defensive');
  }

  if (state.minute >= 58 && s.subsUsed < MATCH.maxSubs && rng.chance(state.minute >= 75 ? 0.3 : 0.12)) {
    let worst: { i: number; fatigue: number } | null = null;
    s.slots.forEach((id, i) => {
      if (!id || slotPosition(s, i) === 'GK') return;
      const f = (state.players[id] as PlayerMatch).fatigue;
      if (f > 30 && (!worst || f > worst.fatigue)) worst = { i, fatigue: f };
    });
    const target = worst as { i: number; fatigue: number } | null;
    if (target) {
      const off = s.slots[target.i] as string;
      const on = bestReplacement(world, state, side, slotPosition(s, target.i));
      if (on) makeSubstitution(world, state, side, off, on);
    }
  }
}

/** A computer manager's team sheet: the formation that suits his squad best, and a style that suits the opposition. */
export function chooseAiTeamSheet(world: World, clubId: string, opponentId: string, isHome: boolean, rng: Rng): TeamSheet {
  let best: { formation: FormationId; score: number } | null = null;
  for (const formation of FORMATION_IDS) {
    const club = world.clubs[clubId];
    if (!club) throw new Error(`Unknown club ${clubId}`);
    const fit = club.playerIds.filter((id) => !world.players[id]?.injury);
    const slots = assignToFormation(world, fit, formation);
    const total = slots.reduce((sum, id, i) => {
      const p = id ? world.players[id] : undefined;
      return sum + (p ? effectiveRating(p, FORMATIONS[formation][i] as Position, 0) : 0);
    }, 0);
    const score = total + rng.next() * 6;
    if (!best || score > best.score) best = { formation, score };
  }
  const formation = (best as { formation: FormationId }).formation;
  const gap = teamRating(world, clubId) - teamRating(world, opponentId) + (isHome ? 2 : -2);
  const style: PlayStyle = gap > 9 ? 'attacking' : gap > 4 ? 'attacking' : gap < -9 ? 'park-the-bus' : gap < -4 ? 'defensive' : 'balanced';
  const picked = world.clubs[clubId];
  if (!picked) throw new Error(`Unknown club ${clubId}`);
  const fit = picked.playerIds.filter((id) => !world.players[id]?.injury);
  const slots = assignToFormation(world, fit, formation).filter((id): id is string => id !== null);
  const inXi = new Set(slots);
  const bench = fit
    .filter((id) => !inXi.has(id))
    .sort((a, b) => (world.players[b]?.ability ?? 0) - (world.players[a]?.ability ?? 0))
    .slice(0, MATCH.maxBench);
  return { formation, style, xi: slots, bench };
}

/**
 * Plays the rest of the match. Computer managers run the sides listed in `autoSides`.
 * Returns every key moment from here on, including the substitutions the computer managers made.
 */
export function playToEnd(world: World, state: MatchState, rng: Rng, autoSides: readonly Side[] = SIDES): MatchEvent[] {
  const from = state.events.length;
  while (state.phase !== 'full-time') {
    if (state.phase === 'half-time') startSecondHalf(state);
    for (const side of autoSides) aiManageSide(world, state, side, rng);
    stepMinute(world, state, rng);
  }
  return state.events.slice(from);
}

// ---------------------------------------------------------------------------------------------------------------
// Afterwards
// ---------------------------------------------------------------------------------------------------------------

export interface MatchSummary {
  homeClubId: string;
  awayClubId: string;
  homeGoals: number;
  awayGoals: number;
  /** Players injured in the match. */
  injured: string[];
  /** Players sent off. */
  sentOff: string[];
}

/** Writes the match back to the world: appearances, goals, cards, tiredness and injuries. Call once, after full time. */
export function finishMatch(world: World, state: MatchState): MatchSummary {
  if (state.phase !== 'full-time') throw new Error('The match is not over');
  const injured: string[] = [];
  const sentOff: string[] = [];
  for (const pm of Object.values(state.players)) {
    const player = world.players[pm.id];
    if (!player || (!pm.started && pm.minutes === 0)) continue;
    for (const stats of [player.seasonStats, player.careerStats]) {
      if (pm.started) stats.starts++;
      else stats.subAppearances++;
      stats.goals += pm.goals;
      stats.yellowCards += pm.yellowCards;
      stats.redCards += pm.redCards;
    }
    player.fatigue = Math.round(pm.fatigue);
    if (pm.injury) {
      player.injury = pm.injury;
      injured.push(pm.id);
    }
    if (pm.redCards > 0) sentOff.push(pm.id);
  }
  return {
    homeClubId: state.sides.home.clubId,
    awayClubId: state.sides.away.clubId,
    homeGoals: state.score[0],
    awayGoals: state.score[1],
    injured,
    sentOff,
  };
}

/** Plays a whole match between two computer managers and writes it back to the world. Handy for simulating the user's match without playing it. */
export function simulateFullMatch(world: World, homeClubId: string, awayClubId: string, rng: Rng): MatchSummary {
  const state = createMatch(
    world,
    homeClubId,
    chooseAiTeamSheet(world, homeClubId, awayClubId, true, rng),
    awayClubId,
    chooseAiTeamSheet(world, awayClubId, homeClubId, false, rng),
  );
  playToEnd(world, state, rng);
  return finishMatch(world, state);
}
