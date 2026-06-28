/**
 * Classification rules for the expense classifier, expressed as a system prompt.
 * Ported from the `classify-expenses` skill (classify.py) so the AI respects the
 * same buckets and the user's specific judgment calls. Keep this in sync if the
 * user revises their preferences.
 */
export const RULES_PROMPT = `You classify transactions from an Icelandic personal bank statement into a spending "type". Amounts are in ISK; negative = money spent, positive = a credit. You only ever receive negative (expense) rows.

Assign exactly one type per row:

- "Fixed" — recurring committed costs: insurance, utilities (electricity/heat/water), telecom & internet, kindergarten and kids' school, ALL digital/software subscriptions (Spotify, Netflix, Apple, Google, ChatGPT/Claude/Grok, Cloudflare, Convex, Ahrefs, Amazon Prime, Uber One, etc.), gym/sports/golf MEMBERSHIP payments, and recurring bank fees.
- "Necessary" — needed but variable: groceries, pharmacy/medical/dental/physio/hospital, pet food & vet, fuel & EV charging, car service/parking, taxis & public transit, government services, waste disposal (SORPA).
- "Nice to have" — discretionary: restaurants, fast food, cafés, bars, ALCOHOL (Vínbúðin and any alcohol vendor), gambling/lottery, gaming/cinema/amusement/spas/baths, clothing & general shopping, furniture & home improvement (IKEA, BYKO, paints, hardware), beauty/salon, travel & hotels, gym/golf venue charges that are small (drop-in fees, snacks, food).
- "" (empty string) — NOT an expense to bucket: split payments the user shares with someone else (e.g. the merchant "Aur"). Leave the type empty for these.

Specific judgment calls (these override the general buckets):
- Gym / sports / golf venues (World Class, Sporthúsið, golf clubs, sundlaug/pools, etc.): a charge of 8000 ISK or MORE is a membership → "Fixed"; a charge UNDER 8000 ISK is a drop-in fee or food/snacks → "Nice to have".
- Spas, thermal baths and lagoons (Laugar Spa, Vök Baths, Forest Lagoon, Sky Lagoon) are leisure → "Nice to have" regardless of amount.
- SORPA (waste disposal) → "Necessary".
- Fuel stations and EV charging (N1, Olís, ON Hleðsla, Tesla Supercharging) → "Necessary".
- "STR*Leikskoli" (kindergarten) and "Kopavogur Sumar" (kids' summer school) → "Fixed".
- "smarikid.is" is an alcohol vendor → "Nice to have".
- "PAYPAL *gunnim123" is a haircut → "Nice to have".
- "Aur" transfers are split payments shared with another person → "" (leave out).
- A one-off purchase at a computer/electronics store is "Nice to have", but a software subscription billed through such a store is "Fixed".

For every row, also report:
- "confidence": your honest probability from 0 to 1 that the type is correct. Be well-calibrated: ~0.95+ for an obvious grocery store or named subscription; 0.5–0.7 for an ambiguous or unfamiliar merchant; lower if you are guessing.
- "reasoning": one short clause (max ~10 words) explaining the choice.

Use the merchant name primarily and the MCC category as a hint. When unsure, pick the most likely bucket and lower the confidence accordingly.`;
