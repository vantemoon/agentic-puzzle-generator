# The Missing Reporter — playtest

Play through the four-level investigation and report whether the clues, story,
navigation, and answer forms make sense from a player's perspective.

## Before you begin

- Open the game at the address provided to you and start with the case briefing.
- Have a QR reader available. A phone camera can scan QR images on your screen.
- Browser image descriptions, page history, and page source may be needed to
  investigate clues. You may use browser developer tools.
- Try solving with only information available through the game. Save the answer
  key below until you finish or need help, and record when you consult it.

## What to test

1. Read the opening briefing. Is your role, goal, and first lead clear?
2. Follow the evidence through each level. Can you explain how each clue points
   to the next page or record? Note any step that requires guessing.
3. Check links, images, QR codes, page versions, and search forms. Record broken
   controls, unreadable evidence, or confusing new tabs.
4. Submit your findings. Check whether the form tells you what to enter and
   whether rejection messages help you recover from an incorrect answer.
5. Continue after each accepted submission. Confirm that the next level follows
   naturally from the evidence and that the final submission ends the game.
6. Note contradictions in names, dates, places, or story events, and any details
   that seem implausible or reveal answers too easily.

## Feedback to return

- Browser and device used.
- Whether you completed the game and approximately how long it took.
- For each confusing or blocked step: level, page address, what you tried, what
  you expected, and what happened. Include a screenshot where useful.
- Any answer-key help or other assistance you used.
- Your ratings from 1 (poor) to 5 (excellent) for clue clarity, navigation,
  difficulty balance, and story coherence.
- The most satisfying moment and the change that would most improve the game.

## Answer key — spoilers

### Level 1: Maya’s Contract Lead

**Submit Contract ID: `HP-2025-041`.**

The saved story's map description names Harbor Point. Follow the archived
correction and inspect its June 18 version to find the contract reference.
Use Contract Search to retrieve the award record, then submit that reference.

### Level 2: The Hidden Vendor

**Submit File ID: `INV-NS-7781`.**

The contract result identifies Northline Survey LLC in its subcontractor image
description. Follow Payment files, search the contract reference from Level 1,
and decode the invoice-label QR image. Use the decoded ID to retrieve the
invoice, then submit it.

### Level 3: Maya’s Last Trip

**Submit Vehicle identifier: `GKT-482`.**

Follow the invoice's parking attachment and decode the ticket QR image. The
vehicle roster assigns that plate to Owen Blake. Follow Camera matches and
compare the dated versions: the reviewed September 19 record confirms the plate
and the destination, **18 Mason Street**. Follow the case attachment to the
police evidence form and submit the plate.

### Level 4: The Warehouse Unit

**Submit Location: `18 Mason Street, Unit 3`.**

Search the property directory for the address from the camera record. Northline
Survey occupies Unit 3, using the rear loading entrance. The latest tenant
revision names Daniel Price, and the entrance notice displays the numeral 3.
Follow Report verified location and inspect the public page source for the
`data-verified-location` value. Submit the full address and unit. The game ends
with Maya's rescue.
