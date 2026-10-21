# The Gaffer: build spec

Retro pixel-art football management game. Mobile first. The visual reference is `docs/mockup.html` (a clickable mock-up with sample data). This file records the rules agreed while designing it.

## Decisions
- Web app, TypeScript (Vite), installable as a PWA.
- Saves live on the device only (IndexedDB). No accounts, no server.
- Build order: game engine first (pure TypeScript, no UI, with tests), then screens.

## World
- You create a club (name, stadium, shirt style, primary and secondary colour). You start in the bottom of four divisions.
- Four divisions of 20 clubs. All clubs, players and stadiums are fictional and generated.
- Every club has a squad of 18, with ability scaled to its division, team colours, a kit style and a named stadium.
- 38-game season, every club plays every other home and away.
- Kit styles: plain, hoops, stripes, sleeves. Goalkeeper kit is green, or yellow if the primary colour is green.

## League rules
- Division One: champion, bottom 3 relegated.
- Divisions Two to Four: 1st and 2nd promoted, 3rd and 4th play a one-off play-off final (3rd v 4th at the higher-placed club, winner promoted). Bottom 3 relegated in Divisions Two and Three. No relegation from Division Four.
- Champion is the first-placed club at the end of the season, or earlier once nobody can catch them.
- All other clubs' results are simulated every matchday. Strength comes from ability, recent form and league position, with goals drawn from a Poisson curve. Upsets must be rare but possible (a rough target: bottom beats top about 2-3% away, 13% at home).
- Top scorers ladder per division, built from real generated players.

## Cup
- One Challenge Cup across all four divisions (80 clubs): preliminary round (16 ties, 48 byes), Round 1, Round 2, Round of 16, quarter-finals, semi-finals, final.
- Ties are played midweek, between league matches, until the user's club is out. The rest of the cup is then simulated on the same dates until a winner is crowned.

## Trophy cabinet
- Lists every league title and cup win in the user's career with the club (name and season).

## Money
- Income per match: sponsors (every match) plus ticket sales (home matches only).
- Wages are paid every week, so the weekly numbers must balance.
- Stadium upgrades (stands) raise capacity, which raises home gate income only if the stadium actually fills.
- Sponsors: one slot in the bottom division, one more slot per promotion, maximum of four. Sponsor offers unlock through achievements.

## Transfers
- Winter window: all of January. Summer window: the whole close season (May to August), which advances one week at a time.
- Buying is a two-step negotiation, each step with 3 attempts: first the fee with the club, then the wage with the player. Each offer is lower, market value or higher; higher is more likely to be accepted, lower less likely but possible. A rejection can produce a counter-offer.
- Selling works from offers received.
- Players may move between clubs in the windows.

## Players
- Abilities rise with good performance.
- Positions: natural, adjacent (about -14%) or alien (about -40%; goalkeeper swaps are far worse).
- Fatigue: over 50% shows a tired marker. Over 80% sharply raises injury chance.
- Injuries happen occasionally. Injured players cannot be selected and miss a number of weeks.
- Contracts: games remaining, wage, happiness (derived from form and performance). Re-signing chance depends on happiness and the offer.
- Stats tracked per player: appearances (starts and sub), goals, yellow and red cards, for the current season and for their career with the club.
- Captain badge.

## Match day
- Pre-match screen: opposition summary, starting XI on a pitch, bench, play style. Changes before kick off are free and do not use substitutions.
- Text commentary for key moments only: goals, attempts, corners, bad fouls, cards, injuries, substitutions, half time, full time.
- The clock stands still while a goal or red card banner flashes.
- Pause opens a "change your plan" sheet: play style (gung ho, attacking, balanced, defensive, park the bus), formation, most-tired list, and drag-and-drop substitutions. Maximum 3 substitutions. A player taken off cannot return. A forced injury replacement must be made before play resumes.
- Formation, play style and the opposition's ability should influence the result.
- Goalscorers, red cards and injuries are listed under the clock on each side, in that order.

## Season flow
- League matchday every week, cup ties midweek.
- Between seasons the game moves a week at a time through the summer window.

## UI rules
- Sticky header and nav, content scrolls beneath.
- Bottom sheets for player details, contract offers, signing negotiations and the match plan. They scroll internally and always open at the top.
- Drag and drop (pointer events) for lineups and substitutes.
- Press Start 2P everywhere. Dark pixel look. The primary colour of the user's club tints the frame subtly.

## Engine notes (decisions made while building)
- Fixtures: the second half of the season replays the first half with venues swapped, in reverse order, so no club has more than three home or three away matches in a row.
- League simulation: team strength is the best goalkeeper plus the ten best fit outfield players, adjusted for the last five results and league position. Goals come from a Poisson curve.
- Cup rounds are played after league matchdays 3, 7, 11, 16, 22, 28 and 35 (the final). A cup tie that finishes level goes to a shoot-out, which is close to a coin flip.
- Cup rounds the user has no tie in, or after they are out, are simulated automatically when due.
- Play-off final: 3rd plays 4th at 3rd place's ground. A level score goes to a shoot-out.
- At season end, three clubs move between each pair of neighbouring divisions: the bottom three go down, and 1st, 2nd and the play-off winner go up. Divisions stay at 20.
- The user's club gains a sponsor slot on promotion (maximum four) and keeps its slots if relegated.
- Honours (league titles, cup wins) are recorded in `world.honours` for the trophy cabinet.

## Game flow (screens)
- Starting a new game shows only the New Game screen. There is no navigation yet.
- Pressing "Create club" removes the New Game screen for good and shows the normal navigation: HQ, Team, Season, Transfers, Club.
- Match Day is never in the navigation. It is only reached from the "Go to match" button on HQ.
- Reset: a subtle "Reset game" option at the bottom of the Club page deletes all saved data and returns to the New Game screen. It needs a confirmation step built into the page. The save layer must offer a single "delete everything" call.

## Match engine notes
- A match is stepped one minute at a time (`stepMinute`). It stops at half time until `startSecondHalf`, and stops after an injury until the injured player is replaced.
- Team strength in a match comes from who is on the pitch, in which position (natural, adjacent or alien), how tired they are, and the play style. A formation changes the balance between attack, defence and control of the ball.
- Substitutions: three per team, a forced injury replacement is always allowed, a substitute who is taken off cannot return. Pre-match changes and formation or position swaps are free.
- Injury chance per player per minute rises with tiredness and sharply above 80%, and a little with age.
- Calibration (matches between teams in one division): about 2.6 goals, 23 shots, 9 corners, 2.5 yellow cards, 0.1-0.2 red cards, 0.3 penalties and 0.2 injuries per match, home win about 42%, draw about 27%.
- Key moments are events with data. `commentary()` turns them into the capital-letter text shown on screen.
