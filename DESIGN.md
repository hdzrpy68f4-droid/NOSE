---
name: NOSE
description: A mixing desk for aroma. A dark forest field, a light serif, and six lit channels.
colors:
  field: "#0E1410"
  raised: "#141B16"
  rule: "#2E3A31"
  ink: "#F4F1EA"
  soft: "#B1AEA6"
  citrus: "#D19412"
  earthy: "#9C6B3F"
  spice: "#C25B2E"
  pine: "#3E7A54"
  floral: "#8A6BBE"
  herbal: "#4E8D99"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(3.1rem, 8.6vw, 7.25rem)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "clamp(2rem, 4.6vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.625rem"
    fontWeight: 400
    lineHeight: 1.15
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 450
    lineHeight: 1.5
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 450
    lineHeight: 1.4
rounded:
  control: "3px"
spacing:
  gutter: "20px"
  section: "clamp(64px, 10vw, 120px)"
  measure: "33em"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.field}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 22px"
  button-secondary:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "48px"
    padding: "0 22px"
---

# NOSE design system

Chosen 2026-11-16 on branch `redesign`, replacing the look recorded in `docs/design/baseline.md`. The approved opening screen is pictured in `docs/design/direction/`. Product truth lives in `PRODUCT.md`; where the two disagree about what NOSE may say, `PRODUCT.md` wins.

## Overview

NOSE is a mixing desk for aroma. "Loud" is the word growers and shoppers already use for a jar that smells strong, and it is also what a mixing desk measures, so the site shows a jar the way a desk shows sound: six channels, one per aroma family, lit to the height the lab measured. The room is dark and quiet so the meters are the only thing glowing. The voice above them is a light serif, set large and never shouted.

One bold element, everything else restrained: the equalizer is the bold element. Nothing else on a page competes with it.

## Colors

- **Field `#0E1410`**: a green-black, the room. Every page stands on it. **Raised `#141B16`** is the same field one step lighter, for a panel that must separate from the page. **Rule `#2E3A31`** draws hairlines and the borders of buttons and chips. A form field's border is **soft**, so the field can be found: rule is 1.5:1 on raised, soft 7.9:1 (the owner's call, 2026-11-19).
- **Ink `#F4F1EA`** is text and the primary button's fill. **Soft `#B1AEA6`** is secondary text. Both pass 4.5:1 on the field and on raised.
- **The six family colours are the only colour on the site.** They are defined once, in `css/tokens.*.css`, and `colour-tokens-test` holds every copy to it. They mean their family and nothing else: no family colour is ever used as decoration, as a button, or as a status.
- On the field, family colour appears as **light** (meters, bars, swatches), not as small text: pine and earthy fall under 4.5:1 there. Text that names a family is ink.
- There is no accent colour, no gradient wash, and no pure black.

## Typography

- **Fraunces** (display, headline, title, the jar's name, the big readouts) at weight 400, optical size automatic, tight tracking. It is never set bold, never italic for emphasis, and never has one word picked out.
- **Hanken Grotesk** (everything else) at 450 for running text, 600 for buttons and 650 for values that must be found fast.
- Both are open-licence (SIL OFL 1.1), self-hosted in `css/fonts/` with the licence beside them, and named by content hash because `/css/*` is cached as immutable.
- Labels are sentence case, the body face, one step smaller. No tracked capitals, no monospace labels, no eyebrow above a heading. Numbers that change in place use tabular figures.
- Running text holds to about 33em. Nothing is set under 13px.

## Layout

- Phone first. Every screen is designed at 390 wide, one-handed, then widened. The container is `min(1240px, 100% - 40px)` and centred; past that the gutters grow and the measure does not.
- Opening screens are centred and fit one screen: the headline, one sentence, the actions and the desk are all visible at 390x844 and at 1280x800 without scrolling.
- Sections are separated by space and a hairline, not by boxes. A list of things is a list, set on rules; a card is used only for a thing a person picks up or opens (a jar, a family, a report).
- Touch targets are 44px or more.

## Elevation & Depth

Flat. Depth comes from light, not shadow: a lit segment casts a soft halo of its own family colour onto the dark segments around it. There are no drop shadows. A raised panel is told apart by its tone and a hairline.

## Shapes

Square and fine. Controls have a 3px radius and a 1px border. Meter segments are small rectangles with a 2px gap. Photographs are cropped square-cornered. Nothing is a pill, and nothing is rounded past 3px.

## Components

- **The desk (equalizer).** Six channels in family order (citrus, earthy, spice, pine, floral, herbal), with no gap between families: colour alone marks the boundary. Each channel is several thin columns of segments (8 on desktop, 4 on a phone). A column is lit to its family's terpenes in percent by weight for the jar shown, so a louder jar stands taller; full scale is 1.05%. Unlit segments show the family colour at 13%. The top lit segment of each column is a brighter peak marker.
  - **Motion:** each column drifts around its true value on two slow overlapping sines, by about a third of its height, and travels to the new value when the jar changes. This is the site's one ambient motion. It stops for `prefers-reduced-motion`, and pauses off screen.
  - **Honesty:** the printed percentages are exact; the motion is a meter's shimmer, never a change in the reading. The readout above the desk is total terpenes, the jar's loudness. The line under it says the jars are samples.
- **Readouts.** A figure in Fraunces with its unit small beside it and a plain label on the left, on a hairline.
- **Buttons.** Primary: ink fill, field text. Secondary: 1px ink border. Both 48px high, 3px radius, sentence case, named for what happens ("Match a jar"). No arrows in link or button text.
- **The jar picker.** Two 44px bordered arrow buttons either side of the jar's name in Fraunces (1.625rem on a phone, 2.5rem on desktop) with its one-line description under it.
- **Header.** The six-bar mark, whose bars move like a level meter (the owner's call, 2026-11-17; still for reduced motion), the wordmark in Fraunces, plain links in soft that turn ink, and a bordered menu button on a phone. Footer: the same links on rules.
- **Focus.** A 3px solid ink outline, offset 3px, on every interactive element.

## Do's and Don'ts

- Do let the desk be the only thing that glows. Do show the real product (a jar on the desk, two jars compared) before describing it.
- Do say what a figure is and that a sample is a sample.
- Don't use a family colour for anything but its family. Don't add an accent colour.
- Don't box content in cards, put a label above a heading, join meta with middle dots, or append arrows to links.
- Don't add another ambient animation beyond the desk and the wordmark's meter, a scroll reveal on every section, or hover motion on every element.
- Don't invent proof: no statistics, logos, ratings or testimonials (`PRODUCT.md`, Evidence on Hand).
- Don't write a word about effects (`CLAUDE.md`, the scope rule).
