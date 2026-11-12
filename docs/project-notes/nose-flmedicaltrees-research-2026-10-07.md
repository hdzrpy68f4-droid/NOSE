# r/FLMedicalTrees on terpenes and flavor: findings for NOSE (2026-10-07)

Five r/FLMedicalTrees threads, read against NOSE's code (commit c337c70), its 56 Florida lab-report fixtures, published aroma research and Florida's rules. The short version: Florida patients already build NOSE's palate by hand, but to predict effects; the smells they chase are the ones a lab report can't see; and in Florida's market most products look alike to NOSE's maths.

Corrected 2026-10-14: two research details in finding 8. ASTM's news piece ties terpene loss to water activity below 0.50, not to the range's 0.55 edge, and the storage study's "more than half" is an average across conditions, not true of each one.

## Bottom line

1. **Patients already build NOSE's palate by hand.** The sub's pinned terpene guide tells people to save the reports of jars they liked and compare new reports against them. Commenters keep lists of their favorite strains' top terpenes.
2. **They do it to predict effects.** That guide (326 upvotes, 92 comments) gives every terpene an effect role, and both strain reviews credit terpenes for how the jar felt. NOSE's aroma-only line is its differentiator here, and its friction.
3. **Smell and taste still decide a jar.** A recurring review series in the sub scores Nose and Taste separately and checks one against the other.
4. **The smells they chase are the ones lab reports can't see.** Run through NOSE's maths, the posted Frog Poison report draws a bar that is 41% Spice, 21% Floral and 12% Citrus, for a jar its reviewer called pure gas with no floral or citrus at all.
5. **Most Florida products look alike to the maths.** In NOSE's own fixtures, 67% of flower pairs score Good or better.
6. **Freshness numbers exist but hide.** Page 1 of the Blueberry Diesel report says PASSED; later pages print 11.6% moisture and 0.58 water activity. The app shows raw values with no verdict, and ASTM publishes the range to judge them by.
7. **Lab trust is shaky, and normalization is an honest answer to it.** A lab that inflates every number by the same factor can't change a jar's shape.

## What I read, and the limits

- **Threads.** Reddit blocks my tools, so you sent five threads as full-page PDFs on Oct 7: two strain reviews with their lab reports, the two pinned terpene guides (101 and 201), and a thread on dry bud and reading COAs. Each page also lists about 25 other posts with vote and comment counts; I use those titles only as a rough signal of what's being discussed.
- **Limits.** Five hand-picked threads; one person wrote both reviews; the PDFs hold only the top comments. Nothing here measures how common a view is.
- **Cross-checks.** NOSE's repo and its own match maths (loaded from `js/match-math`, never copied), the 56 accepted fixtures, published studies, Florida's rules and OMMU data.
- **Blueberry Diesel's terpenes** were read from the full Kaycha report, reached through the QR code on the screenshot in the post, via a text summary of the PDF. The rows sum to the printed 2.29% total.
- No usernames, and nothing quoted from posts.

## Findings

### 1. Patients already build palates by hand

- The 101 guide's advice for learning your preferences: gather the reports of jars you know you like, compare their terpene profiles, then check new jars against them. That is NOSE's palate, step for step.
- One commenter says they'll do exactly that; another keeps a list of the top terpenes in strains that work for them.
- When shopping different dispensaries, the guide's author compares new jars against two favorite profiles (a Gelato type and a Z type).
- On 201, a commenter asks how to get per-terpene values: product pages show a total and a graphic, and the values sit in the report. Reading the report is NOSE's job.

**For NOSE:** demand for the core feature is real and self-taught. The friction is manual: finding reports, reading tables, comparing by eye.

### 2. The frame is effects

- 101 casts each terpene as a character with an effect role, and describes three-terpene combinations as effect arcs. 201 adds a possible medical direction for each terpene and percentage bands for when one starts to matter. Its author says plainly that the science is early and nothing is guaranteed.
- Both reviews attribute effects to specific terpenes.

**For NOSE:**
- NOSE can't answer the question most of this audience is asking, and shouldn't pretend to. What it can say honestly: this jar's smell and taste are closest to the ones you liked.
- People will read a close match as a prediction of how a jar will feel. Copy shouldn't encourage that, and the FAQ needs a plain answer to "Will a close match feel the same?": nobody knows yet, and NOSE doesn't claim it.
- The community's own educator hedges on the science. NOSE holds the same hedge consistently, which can land as credible rather than evasive.
- Don't borrow the guides' character names for terpenes, even as flavor metaphors. They are effect language.

### 3. Smell and taste are how they judge a jar

- The review series scores cure, nose, taste, effects, duration and overall. Nose and taste are separate scores, and reviewers say whether the nose carries into the taste.
- Words used for the two jars: gas, fuel, diesel, earthy, chem, funk, GMO, berry, sweet, cat pee. Reviewers also name profiles a jar was not: orange-forward, terpinolene-heavy, or a brand's usual floral-and-hay smell.
- Farnesene comes up often enough that a commenter calls it the terpene the sub loves to argue about. NOSE files it under Herbal as a borderline call, as the code comment says.

How that vocabulary meets NOSE's six families:

| Patient words | NOSE family | Note |
|---|---|---|
| orange, citrus | Citrus | Limonene-led jars: in reach |
| terpinolene-heavy | Herbal | In reach |
| earthy | Earthy, partly | Frog Poison was called earthy; myrcene was 10% of its bar |
| sweet, berry | none | Research ties sweet notes to esters, tropical notes to sulfur compounds |
| chem, savory, GMO funk | none | Research ties savory and chemical notes to skatole and indole |
| gas, fuel, diesel | none | Not a terpene note; no study I found isolates it |
| skunk, cat pee | none | Research ties skunk to sulfur compounds |
| hay | none | Usually blamed on drying and curing |

**For NOSE:** the six families serve the orange and terpinolene jars well and the gas jars badly, and gas is what this sub chases.

### 4. Two jars from the threads, through NOSE's maths

| | Frog Poison (Sunkissed, Goldflower) | Blueberry Diesel (Reef, Curaleaf) |
|---|---|---|
| Lab, sampled | TerpLife, Sept 26, 2026 | Kaycha, Sept 17, 2026 |
| Total terpenes | 4.86% | 2.29% |
| Leading terpenes, as share | caryophyllene 31.8%, linalool 11.8%, limonene 11.7% | myrcene 36.8%, caryophyllene 22.5%, limonene 9.4% |
| NOSE's bar | Spice 40.9 · Floral 20.8 · Citrus 11.7 · Herbal 10.8 · Earthy 10.2 · Pine 5.5 | Earthy 36.8 · Spice 28.7 · Herbal 11.6 · Citrus 9.4 · Floral 8.0 · Pine 5.6 |
| What the reviewer smelled | overwhelming gas, earthy, diesel; so gassy it's almost sweet; no floral, no citrus | sweet funky chem, faint berry, GMO funk, cat pee; no floral or hay |
| Good or better against the 25 flower fixtures | 18 | 12 |

- Frog Poison's bar puts a fifth of the jar in Floral (whose copy reads lavender, rose, chamomile) and an eighth in Citrus (lemon peel, orange zest), beside a reviewer who smelled neither. On the jars this sub loves most, NOSE's own words can visibly contradict the patient's nose.
- NOSE scores the two jars 70, Partial overlap. The same reviewer put both in the gas-and-chem world, differing in sweetness. Whether 70 is right is exactly what the votes are for.
- Two jars and one nose prove nothing. But this is the failure the 2023 study below predicts.

### 5. The research on the blind spot

- **2021, Oswald and colleagues (ACS Omega):** skunk aroma comes from a family of sulfur compounds; one was most abundant in the cultivars a panel rated most pungent. They found little evidence that terpenes produce it.
- **2023, the same group (ACS Omega, 31 rosin cultivars):** tropical and citrus notes in "exotic" cultivars came from another kind of sulfur compound, savory and chemical notes from skatole and indole, sweet notes from esters. Terpene profiles were very similar across cultivars that smelled very different.
- **Caveats:** the 2023 work is on rosin, not flower, and most of its authors work for a company that sells flavor compounds, which benefits from a beyond-terpenes message.

**For NOSE:** this is the strongest outside evidence against the core hypothesis, and it belongs on the method page beside the hypothesis. It also says where matching should hold best (citrus-, pine- and herbal-led jars) and fail most (gas, savory, candy).

### 6. Most Florida products look alike to the maths

The 56 accepted fixtures, scored with NOSE's own functions:

| | Pairs | Strong (≥0.90) | Good or better (≥0.75) | Median |
|---|---|---|---|---|
| 25 flower reports | 300 | 78 (26%) | 202 (67%) | 0.82 |
| All 56 reports | 1,540 | 351 (23%) | 832 (54%) | 0.78 |

- Every flower fixture is led by caryophyllene (11), limonene (9) or myrcene (5), and its top two terpenes hold a median 50% of the profile.
- Frog Poison scores Good or better against 40 of the 56 fixtures, and Strong against 13.

**For NOSE:** when two Florida flower reports are more likely than not to be a Related profile, the band alone tells a patient little. The maths isn't wrong; the market is narrow. The fixtures are a convenience sample, so confirm this on the live archive before acting.

### 7. Total terps are a headline number, and batches drift

- Strain posts put THC and total terpenes in the title. To this audience total terps is a quality number: the intensity axis NOSE already keeps apart.
- The post lists show drift: Sunkissed's Frog Poison at 27.1% THC and 3.72% terps four months ago, 34.2% and 4.86% now; Reef's Orange Z at 26.7% and 1.79% ten months ago, 26.2% and 2.25% last month.
- 201 reads each terpene's absolute percentage as presence. By its general bands, four of Frog Poison's terpenes are main drivers (0.50% or more). As shares, one terpene holds a third of the profile and the next three 11–12% each. In a loud jar, absolute bands make everything look important.

**For NOSE:** the rule to trust this jar's report, not the strain name, is visibly right. And shares-not-percentages is teachable with the community's own example.

### 8. Freshness: dry bud and hidden numbers

The dry-bud thread (posted Oct 6; 37 upvotes, 50 comments):
- Its rule of thumb: moisture 10–12%, water activity about 0.53–0.65; flower above 12% moisture burns harsh.
- Commenters say they've never seen a number in the moisture box, only blanks, N/A or a pass, and that one-page Trulieve reports often show only pass or fail. The author says multi-page reports usually print the numbers on page 2 or 3; another commenter says more brands are starting to.
- Check the report's dates: older flower is drier than its report says.
- A top comment blames pre-packing: flower is sealed in its jar and left to finish curing there.

What the two reports show:
- Blueberry Diesel: page 1 says Moisture PASSED and Water Activity PASSED; the full report prints 11.6% and 0.58, both inside ASTM's range. The commenter's point holds: the numbers exist, a few pages in.
- Frog Poison's one-page TerpLife report shows both as PASS, with no number.
- Both print a harvest date (Aug 10 and Sept 11, 2026) and an expiration date about a year after sampling, which Florida's new COA rule requires.
- In NOSE's fixtures, 15 of 25 flower reports give the parser a moisture or water-activity number; none of Method's do.

The research:
- ASTM D8197 specifies 0.55–0.65 water activity for dried flower. ASTM's own news piece ties the top of the range to microorganism growth above 0.65, and terpene loss, with weaker taste and smell, to water activity below 0.50.
- A 2020 storage study (Frontiers in Plant Science) found terpenes fell under every condition tested, by more than half on average within four months, with lighter and heavier terpenes on similar trends.
- A 2016 irradiation study (four varieties) found some terpenes reduced and the profile's character unchanged.

What the app does today: the confirmation card prints the moisture and water-activity values, or "not printed". There is no verdict, and the app doesn't use the harvest date the parser reads.

**For NOSE:**
- Turn the values into a plain verdict against ASTM's range: too wet, in range, too dry. The project spec's water activity under 0.65 has no dry side, and dry is this thread's complaint.
- When a report prints only a pass, say so: a pass, with no number printed.
- Show the harvest date and the jar's age. When the decay curve is built, apply it to loudness, not shape: both studies point to lost intensity rather than a new profile.
- Buying blind makes this matter more. Florida's 2020 rule required plain, opaque, white packaging for smoking products, and one chain began selling flower in windowed bags in late 2024 so patients could at least see it. Nothing I read gives patients a way to smell before buying, which makes the report the closest thing to a preview.

### 9. Lab trust

- In the Blueberry Diesel thread a commenter says Kaycha has come under fire for changing results; the poster asks whether any lab can be trusted, and says nearly every dispensary they use relies on Kaycha except three chains. I found no public record of that claim. MJBizDaily reported Florida lab shopping for higher THC numbers in 2022, without naming Kaycha.
- Florida has six certified labs today: ACS, ACT, Kaycha (Miramar), Method, Modern Canna and TerpLife. NOSE's parser reads all six.
- TerpLife's report labels its terpene results informational, and ACS Lab's summary of the 2026 testing rules doesn't list terpenes among the required tests.

**For NOSE:**
- Normalization means a lab that inflates every number by the same factor can't move the shape, only the total. That's a structurally true line for the method page.
- Never say a lab is wrong; NOSE has no basis to.
- "Reads every certified Florida lab" is a true, specific claim NOSE can make today.

### 10. Getting the report: codes and screenshots

- The Kaycha screenshot in the Blueberry Diesel post carries the lab's QR code. Decoded, it led to the lab's portal and the full seven-page report. The TerpLife screenshot's QR was too small for my decoder.
- The app already has a scan-from-image path (the file input behind `scanQrImage`). Whether it decodes Reddit-compressed screenshots is untested.
- The Frog Poison bag's front label shows an abbreviated strain name, a batch code containing the harvest date, and a 1D barcode with a product ID. I can't tell whether the bag has a QR elsewhere. NOSE's scanner reads QR codes only, so pointed at a 1D code the camera just keeps looking.
- Florida's 2020 labeling rule provided for a QR or bar code giving access to the report. Its 2026 replacement (64-4.219, in force Aug 24) is a Word file I couldn't open.

**For NOSE:** patients share reports as screenshots, and the review series attaches one to each review. If the image path reads them, "screenshot a COA you saw, and NOSE reads its QR" is a cheap way in. Test it on ten real screenshots and five real bags first.

### 11. Other signals (post titles only)

- Hype and scarcity: several Frog Poison posts in a week; one store's batch sold out in about 20 minutes.
- Brand-level terpene debates (one brand's low totals), a thread asking a chain to show its reports, a favorite-terpene thread, and high-engagement threads venting at Trulieve.
- Vapes and rosin appear often in the lists but weren't in the sample.
- Marijuana Moment reported on Oct 2 that two adult-use measures aimed at 2028 have been filed; they would let existing medical dispensaries sell to adults six months after passage.

## Recommendations, ranked

In the project's order: the matching maths and what validates it, then brand rules, then polish.

| # | Recommendation | Why | Effort |
|---|---|---|---|
| 1 | Fix the refused Moderate and Low votes (already in Still open) | Without them NOSE can't learn whether a low score means a different flavor, which is half the hypothesis test. The two jars above (70, Partial overlap) are that case. | Small; its own prompt |
| 2 | Say what a lab report can't smell, on the method page and under every bar | Gas, skunk, savory and much of sweet come from compounds Florida labs don't report, and those are this sub's favorite jars | Small; copy |
| 3 | Turn moisture and water activity into a verdict against 0.55–0.65 | The card shows raw values; ASTM gives the range; dry bud is a live complaint | Small |
| 4 | Show harvest date and age; when decay is built, decay loudness, not shape | Harvest dates are printed; storage and irradiation studies point to lost intensity | Small now |
| 5 | Measure score compression on the live archive | 67% of fixture flower pairs score Good or better | Medium; analysis first |
| 6 | Test the screenshot path and real bag labels | A posted screenshot's QR led to the full report; the scanner reads QR only | Small |
| 7 | Let a vote carry an optional smell word (gas, funk, sweet, citrus…) | Turns the blind spot into data on where shape-matching fails. It changes what a vote holds, so the privacy page comes first. | Medium |
| 8 | Write three articles from the sub's questions | Reading a COA for smell (shares, not percentages, with Frog Poison); why your jar is drier than its report; what "gas" is | Medium; content |

On #5: if the archive agrees, keep `cosine()` and the bands, and add context instead. Either show where a match sits among what NOSE has read ("closer than X% of Florida flower pairs"), or name the two terpenes that separate the jars. Let the votes choose.

Checked, no action needed now:
- **Unmodelled compounds carry little mass.** In the fixtures they hold a median 0% of measured terpene mass; 3 of 56 lose more than 5%, and Frog Poison loses 2.5%. Modelling valencene, geraniol, eucalyptol or guaiol (all described as aroma notes in the 101 guide) would change scores and the golden file for little gain today.
- **Method's top-ten summaries are safe.** Cutting every fixture with more than ten terpenes to its top ten changes its score against its full panel by at most one point (lowest cosine 0.991, across 47).

## Positioning, community and B2B

- **The line for Florida:** find more jars that smell and taste like the ones you loved. It names the community's own habit and stays off effects.
- **Florida first still holds.** 941,963 active patients and 782 dispensing locations (OMMU, Oct 2); adult use failed to make the 2026 ballot; the new measures aim at 2028.
- **The sub is where testers are.** Check its rules on self-promotion, never scrape it, and get permission before quoting anyone; the testimonial rule applies.
- **A report-to-fingerprint card** (smell and taste only, no effect fields) fits the review series' habit of posting a report with each review. An image is unreadable to screen readers, so pair it with text.
- **B2B:** the 20-minute sellout supports the widget's sold-out panel. Menus show a total and a graphic while per-terpene values sit in the PDF, which is the gap the widget bridges. Comparing across dispensaries, as the 101 author does, is the consumer app's job, not a single store's widget.
- **Florida strings:** the advertising rule (64ER25-6, in effect since Dec 31, 2025) bans child-appealing messaging and holds dispensaries responsible for their vendors. Whether flavor words like candy count is a question for counsel; NOSE's botanical family names are an asset there.

## What could be wrong

- Five threads, and one reviewer for both reviews. Pinned guides may overstate how effect-focused everyday posts are.
- Two jars and one reviewer's nose: the mismatch is a case, not a rate.
- The fixtures are 56 reports you collected, not a market sample.
- The 2023 study is on rosin, from a flavor-company team.
- Blueberry Diesel's values came through a text summary of the PDF, checked only against its printed total.
- The 2026 labeling rule's text is unverified.

## Next research

- More threads: vape terpenes (the botanical search), the brand low-terps thread, the "Am I reading this wrong?" COA thread, and the favorite-terpene thread.
- Three probes on the live archive: the score distribution, dropped mass, and how often each lab prints moisture and water-activity numbers.

## Sources

Threads: five r/FLMedicalTrees PDFs you attached (Oct 7, 2026). Code: NOSE at c337c70 (`js/match-math`, `js/nose`, `PARSER-HANDOFF.md`, `test/fixtures/coa-baseline.json`, Method fixture PDFs). Reports: Kaycha MI60918003-002 via yourcoa.com; TerpLife T6I1187 (screenshot in the post).

- [Oswald et al. 2023, ACS Omega (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10601067/)
- [Abstrax press release on the 2023 study](https://www.businesswire.com/news/home/20231004787760/en)
- [ScienceDaily on Oswald et al. 2021](https://sciencedaily.com/releases/2021/12/211201085147.htm)
- [Storage study, Frontiers in Plant Science 2020](https://www.frontiersin.org/articles/10.3389/fpls.2020.583605/full)
- [Hazekamp 2016, Frontiers in Pharmacology](https://public-pages-files-2025.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2016.00108/text)
- [ASTM on standards D8196 and D8197](https://sn.astm.org/node/2445/printable/print)
- [Florida 64ER20-32, packaging and labeling (JAPC)](https://www.japc.state.fl.us/Documents/Rules/00142000-00142999/00142996.pdf)
- [Rule 64-4.219 (flrules)](https://flrules.org/gateway/ruleNo.asp?id=64-4.219)
- [ACS Lab on Florida's 2026 testing rules](https://www.acslab.com/compliance/what-florida-mmtcs-need-to-know-for-2026-compliance-testing-and-emerging-rules)
- [Fox Rothschild on 64ER25-6](https://www.foxrothschild.com/cannabis-law/publications/florida-severely-restricts-medical-marijuana-treatment-center-advertising-and-marketing)
- [FLUENT window bags (Dec 17, 2024)](https://cansortium.gcs-web.com/news-releases/news-release-details/fluent-becomes-first-market-dispensary-florida-offer-freedom)
- [OMMU certified testing labs](https://knowthefactsmmj.com/cmtl/)
- [OMMU update, Oct 2, 2026](https://knowthefactsmmj.com/wp-content/uploads/ommu_updates/2026/100226-OMMU-Update.pdf)
- [MJBizDaily on Florida lab shopping (2022)](https://mjbizdaily.com/florida-marijuana-testing-labs-under-fire-over-thc-potency/)
- [AP via ABC News: 2026 initiatives fail to qualify](https://abcnews.go.com/amp/US/wireStory/recreational-marijuana-21-citizen-initiatives-fail-qualify-floridas-129794858)
- [Marijuana Moment: two measures filed for 2028](https://www.marijuanamoment.net/recreational-marijuana-would-be-legalized-in-florida-under-two-newly-filed-ballot-measures/)
