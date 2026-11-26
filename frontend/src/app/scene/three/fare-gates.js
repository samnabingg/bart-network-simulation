// Fare gates, the way BART charges with Clipper: tapping in records where your trip started (the
// card needs some value on it), and tapping out at the station where you leave charges BART's real
// fare for that trip, fetched from BART through the backend. If the card is short, the Addfare
// machine tops it up by the difference. Shared by the Bay Fair scene and the generic stations.

const money = (v) => `$${v.toFixed(2)}`;

/**
 * @param o.opts    scene options: fare(orig, dest) -> Promise<number>, stationName(abbr) -> string
 * @param o.game    scene game state: balance, gatesOpen, openUntil, flash, steps, tripFrom
 * @param o.here    { abbr, name } of this station
 * @param o.toast, o.beep, o.onChange  scene UI hooks
 */
export function createFareGates({ opts, game, here, toast, beep, onChange }) {
  let busy = false;
  let shortBy = 0;
  const nameOf = (abbr) => (opts.stationName && opts.stationName(abbr)) || abbr;
  const open = () => { game.gatesOpen = true; game.openUntil = performance.now() + 10_000; beep(990); };
  const reject = (text) => { game.flash = 1.2; beep(220, 0.3); toast(text, 6000); };

  const tapIn = () => {
    if (game.gatesOpen) return;
    if (game.balance <= 0) { reject('The gate shows a red X: your card has no value. Add money at a ticket machine first.'); return; }
    game.tripFrom = here.abbr;
    game.steps.tapped = true;
    open();
    toast(`Tapped in at ${here.name}. You pay when you tap out at the station where you leave.`, 5000);
  };

  const finish = (text) => { game.tripFrom = null; open(); toast(text, 6500); };

  const tapOut = async () => {
    if (game.gatesOpen || busy) return;
    if (shortBy > 0) {
      // Addfare machine: add exactly what is missing, then tap out again.
      game.balance = Math.round((game.balance + shortBy) * 100) / 100;
      toast(`Added ${money(shortBy)} at the Addfare machine. Tap out again.`);
      shortBy = 0;
      beep(660);
      onChange();
      return;
    }
    const from = game.tripFrom;
    if (!from) { finish(`Tapped out at ${here.name}. There was no trip on the card to charge.`); return; }
    if (from === here.abbr) {
      finish(`Tapped out where you tapped in. BART charges an excursion fare for that, which its fare API doesn't give, so nothing was charged.`);
      return;
    }
    if (!opts.fare) { finish(`Tapped out at ${here.name}. The fare service isn't connected, so nothing was charged.`); return; }
    busy = true;
    onChange();
    let fare;
    try {
      fare = await opts.fare(from, here.abbr);
    } catch (e) {
      busy = false;
      finish(`Couldn't get the fare from BART (${e && e.message ? e.message : 'no answer'}). Gate opened without charging.`);
      onChange();
      return;
    }
    busy = false;
    if (game.balance + 1e-9 < fare) {
      shortBy = Math.round((fare - game.balance) * 100) / 100;
      reject(`Not enough value: ${nameOf(from)} to ${here.name} is ${money(fare)} and your card has ${money(game.balance)}. Press E to add ${money(shortBy)} at the Addfare machine.`);
      onChange();
      return;
    }
    game.balance = Math.round((game.balance - fare) * 100) / 100;
    finish(`Fare ${nameOf(from)} to ${here.name}: ${money(fare)} (BART Clipper fare). Balance ${money(game.balance)}.`);
    onChange();
  };

  return {
    tapIn,
    tapOut,
    inLabel: () => (game.gatesOpen ? 'Gates are open, walk through' : 'Press E: tap your Clipper card to enter'),
    outLabel: () => {
      if (game.gatesOpen) return 'Gates are open, walk through';
      if (busy) return 'Checking the fare with BART…';
      if (shortBy > 0) return `Press E: add ${money(shortBy)} at the Addfare machine`;
      return 'Press E: tap your Clipper card to leave';
    },
  };
}
