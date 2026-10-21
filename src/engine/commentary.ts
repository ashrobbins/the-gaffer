import type { MatchEvent } from './matchTypes';
import type { World } from './types';

const surname = (world: World, id: string | null): string => (id ? (world.players[id]?.lastName ?? 'SOMEONE').toUpperCase() : 'THE KEEPER');
const club = (world: World, id: string): string => (world.clubs[id]?.name ?? 'THE CLUB').toUpperCase();
const pick = <T>(items: readonly T[], variant: number): T => items[variant % items.length] as T;
const scoreText = (e: MatchEvent): string => `${e.score[0]}-${e.score[1]}`;

/** The text for a key moment, in capitals like the old text-based management games. */
export function commentary(world: World, e: MatchEvent): string {
  switch (e.kind) {
    case 'kick-off':
      return 'KICK OFF';
    case 'half-time':
      return `HALF TIME ${scoreText(e)}`;
    case 'full-time':
      return `FULL TIME ${scoreText(e)}`;
    case 'corner':
      return pick(
        [`CORNER TO ${club(world, e.clubId)}`, `${club(world, e.clubId)} WIN A CORNER`, `ANOTHER CORNER FOR ${club(world, e.clubId)}`],
        e.variant,
      );
    case 'shot': {
      const p = surname(world, e.playerId);
      const k = surname(world, e.keeperId);
      switch (e.outcome) {
        case 'saved':
          return pick([`${p} SHOOTS... SAVED BY ${k}`, `${k} TURNS ${p}'S EFFORT AWAY`, `GOOD SAVE FROM ${k} TO DENY ${p}`], e.variant);
        case 'wide':
          return pick([`${p} LETS FLY... WIDE`, `${p} SHOOTS BUT IT IS WELL WIDE`], e.variant);
        case 'over':
          return pick([`${p} LETS FLY... OVER THE BAR`, `${p} BLAZES OVER`], e.variant);
        case 'post':
          return pick([`${p}... OFF THE POST!`, `${p} HITS THE WOODWORK!`], e.variant);
        case 'blocked':
          return pick([`${p} SHOOTS... BLOCKED`, `A DEFENDER THROWS HIMSELF IN FRONT OF ${p}'S SHOT`], e.variant);
      }
      return '';
    }
    case 'goal': {
      const p = surname(world, e.playerId);
      const s = scoreText(e);
      return e.penalty
        ? pick([`GOAL! ${p} SCORES FROM THE SPOT ${s}`, `GOAL! ${p} SENDS THE KEEPER THE WRONG WAY ${s}`], e.variant)
        : pick([`GOAL! ${p} FINDS THE NET ${s}`, `GOAL! ${p} SCORES ${s}`, `GOAL! ${p} HITS IT HOME ${s}`, `GOAL! ${p} WITH A FINE FINISH ${s}`], e.variant);
    }
    case 'penalty-miss': {
      const p = surname(world, e.playerId);
      return e.saved ? `PENALTY SAVED! ${surname(world, e.keeperId)} DENIES ${p}` : `${p} MISSES FROM THE SPOT!`;
    }
    case 'yellow':
      return pick([`YELLOW CARD. ${surname(world, e.playerId)} IS BOOKED`, `YELLOW CARD FOR ${surname(world, e.playerId)}`], e.variant);
    case 'red': {
      const p = surname(world, e.playerId);
      return e.reason === 'second-yellow'
        ? `RED CARD! ${p} SEES A SECOND YELLOW AND IS SENT OFF`
        : `RED CARD! ${p} IS SENT OFF FOR A WILD CHALLENGE`;
    }
    case 'injury': {
      const p = surname(world, e.playerId);
      if (!e.mustReplace) return `${p} IS INJURED. ${club(world, e.clubId)} MUST PLAY ON WITH TEN`;
      return e.exhausted ? `INJURY! ${p} GOES DOWN, HE LOOKS EXHAUSTED AND CANNOT CONTINUE` : `INJURY! ${p} GOES DOWN AND CANNOT CONTINUE`;
    }
    case 'sub':
      return e.forced
        ? `INJURY SUB: ${surname(world, e.onId)} REPLACES ${surname(world, e.offId)}`
        : `SUB: ${surname(world, e.onId)} ON, ${surname(world, e.offId)} OFF`;
  }
}
