# Category seed taxonomy (proposal) — #105 / ADR-0020

Curated, deduped subset of the Meniga taxonomy (Expenses-type only): **11 groups / 58 leaves**.
Source for the in-code seed each Household is copied from at creation. `default` = the fallback
**Expense type** (Fixed / Necessary / Nice to have); icons are [Lucide](https://lucide.dev) names
(**provisional** — verify against the installed `lucide-react`, swap any missing name for `circle`).
Synonyms feed classifier + merchant-match hints (Icelandic, matched diacritic-folded).

Conventions:
- Every **group** gets an implicit **"(other)"** leaf at seed time (Meniga's `otherCategoryName`)
  so the classifier can always land on a leaf when no specific subcategory fits — not listed below.
- `default` is a *fallback hint only*; per-transaction Expense type is still assigned independently
  (ADR-0020). Ambiguous leaves default to `Necessary` (neutral middle) and lean on AI/override.
- **IS labels shortened for chip-fit** (see the naming-pass note at the bottom for the full forms).

---

### 1. Food & groceries — *Matur & innkaup*  ·  `shopping-cart`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| groceries | Groceries | Matarinnkaup | Necessary | `shopping-basket` | Bónus, Krónan, Nettó, Hagkaup |
| restaurants | Restaurants | Veitingastaðir | Nice to have | `utensils` | |
| fast-food | Fast food | Skyndibiti | Nice to have | `sandwich` | |
| cafe | Café | Kaffihús | Nice to have | `coffee` | |
| bakery | Bakery | Bakarí | Nice to have | `croissant` | Kökur |
| kiosk-sweets | Kiosks & sweets | Sjoppur | Nice to have | `candy` | Ísbúð, Sælgæti |

### 2. Home & utilities — *Heimili*  ·  `house`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| rent | Rent | Húsaleiga | Fixed | `key-round` | |
| mortgage | Mortgage | Húsnæðislán | Fixed | `landmark` | |
| electricity-heating | Electricity & heating | Rafmagn & hiti | Fixed | `zap` | Hitaveita |
| phone-internet | Phone & internet | Sími & internet | Fixed | `wifi` | Farsími, Net |
| property-fees | Property fees | Fasteignagjöld | Fixed | `receipt` | |
| furniture-appliances | Furniture & appliances | Húsgögn & tæki | Nice to have | `sofa` | Eldhústæki |
| home-maintenance | Home maintenance | Viðhald heimilis | Necessary | `wrench` | Múrari, Pípari, Smiður |
| cleaning | Cleaning | Þrif | Necessary | `spray-can` | Ræstingar |
| pets | Pets | Gæludýr | Necessary | `paw-print` | Hundur, Köttur, Kisa |

### 3. Transport — *Samgöngur*  ·  `car`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| fuel | Fuel | Eldsneyti | Necessary | `fuel` | Bensín, Dísel |
| car-maintenance | Car maintenance | Viðhald bíls | Necessary | `wrench` | Bílaviðgerðir, Bifreiðagjöld |
| car-loan | Car loan & lease | Bílalán | Fixed | `car-front` | Rekstrarleiga |
| parking | Parking | Bílastæði | Necessary | `square-parking` | |
| transit-taxi | Transit & taxi | Strætó & taxi | Necessary | `bus` | Leigubíll |
| ev-charging | EV charging | Rafhleðsla | Necessary | `plug-zap` | |

### 4. Health & wellbeing — *Heilsa*  ·  `heart-pulse`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| pharmacy | Pharmacy & medicine | Lyf & apótek | Necessary | `pill` | Lækningavörur |
| doctors-dentists | Doctors & dentists | Læknar | Necessary | `stethoscope` | Tannlæknir, Sálfræðingur, Sjúkraþjálfun |
| fitness | Fitness & sports | Líkamsrækt | Nice to have | `dumbbell` | Sund, Fótbolti, Ræktin |
| cosmetics | Cosmetics | Snyrtivörur | Nice to have | `sparkles` | |
| hair-grooming | Hair & grooming | Hársnyrting | Nice to have | `scissors` | Klipping, Rakari |

### 5. Insurance — *Tryggingar*  ·  `shield`  (all Fixed)
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| home-insurance | Home insurance | Heimilistrygging | Fixed | `shield-check` | Húseigendatrygging |
| car-insurance | Car insurance | Bílatrygging | Fixed | `shield` | Bifreiðatrygging |
| life-health-insurance | Life & health insurance | Líftrygging | Fixed | `shield-plus` | Sjúkdómatrygging |

### 6. Children — *Börn*  ·  `baby`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| childcare | Childcare & preschool | Leikskóli & gæsla | Fixed | `school` | Barnapössun, Dagmamma |
| childrens-clothing | Children's clothing | Barnaföt | Necessary | `shirt` | |
| toys-allowance | Toys & allowance | Leikföng | Nice to have | `blocks` | Vasapeningar |
| childrens-activities | Children's activities | Tómstundir barna | Nice to have | `puzzle` | Frístundanámskeið |

### 7. Leisure & hobbies — *Afþreying*  ·  `party-popper`  (mostly Nice to have)
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| cinema-events | Cinema, theatre, concerts | Bíó & tónleikar | Nice to have | `ticket` | Kvikmyndahús, Leikhús, Ópera, Sinfónía |
| nightlife | Bars & nightlife | Barir | Nice to have | `wine` | Krá, Djamm |
| streaming-games-books | Streaming, games, books | Streymi & leikir | Nice to have | `gamepad-2` | Netflix, Spotify, Bækur |
| hobbies | Hobbies | Áhugamál | Nice to have | `palette` | Föndur, Hannyrðir, Tónlist, Hljóðfæri, Ljósmyndun |
| outdoors | Outdoor & recreation | Útivist | Nice to have | `tent-tree` | Veiði, Golf, Skíði, Hestamennska |
| lottery-betting | Lottery & betting | Happdrætti | Nice to have | `dices` | Lottó, Bingó, Veðmál |

### 8. Travel — *Ferðalög*  ·  `plane`  (all Nice to have)
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| flights | Flights & transport | Flug | Nice to have | `plane` | Samgöngur í fríi |
| lodging | Hotels & lodging | Gisting | Nice to have | `bed-double` | Hótel, Tjaldstæði |
| travel-food | Food while traveling | Matur á ferð | Nice to have | `utensils` | Gjaldeyrir |

### 9. Shopping & services — *Verslun*  ·  `shopping-bag`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| clothing | Clothing & accessories | Fatnaður | Nice to have | `shirt` | Föt, Spariföt, Fylgihlutir |
| electronics | Electronics & software | Raftæki | Nice to have | `laptop` | Tölva, Hugbúnaður |
| subscriptions | Subscriptions & media | Áskriftir | Fixed | `repeat` | Streymisveitur, Tímarit |
| gifts | Gifts | Gjafir | Nice to have | `gift` | Jólagjafir, Afmælisgjafir |
| alcohol | Alcohol | Áfengi | Nice to have | `wine` | Bjór, Vín, Vínbúð |
| tobacco | Tobacco | Tóbak | Nice to have | `cigarette` | Sígarettur |
| charity | Charity | Góðgerðir | Nice to have | `heart-handshake` | Ölmusa |
| celebrations | Parties & celebrations | Veislur | Nice to have | `party-popper` | Brúðkaup, Ferming, Afmæli |
| post-shipping | Post & shipping | Póstur | Necessary | `package` | Sendingar, Burðargjald |

### 10. Education — *Menntun*  ·  `graduation-cap`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| tuition | Tuition & courses | Skólagjöld | Fixed | `graduation-cap` | Námskeið |
| study-materials | Books & supplies | Námsgögn | Necessary | `book` | Skólabækur, Ritföng |
| student-loans | Student loan payments | Námslán | Fixed | `landmark` | |

### 11. Fees & finance — *Fjármál*  ·  `landmark`
| slug | EN | IS | default | icon | synonyms |
|---|---|---|---|---|---|
| bank-fees | Bank & service fees | Bankagjöld | Necessary | `banknote` | Greiðsluþjónusta, Þjónustugjöld |
| consumer-loans | Consumer loans | Neyslulán | Fixed | `hand-coins` | Smálán |
| fines-interest | Fines & interest | Sektir & vextir | Necessary | `triangle-alert` | Vanskilakostnaður |
| cash-withdrawal | Cash withdrawals | Peningaúttektir | Necessary | `banknote-arrow-down` | Hraðbanki |

---

## Changes from the first draft (per review)
- **Cut:** `summer-house` (Sumarbústaður), `travel-activities`, `child-support` (meðlag — folds into
  the broader Children group / its "(other)" leaf).
- **Broadened:** `music-instruments` → **`hobbies`** (Áhugamál), a general leaf that also absorbs
  crafts, needlework, music/instruments, and photography.
- **Kept:** `lottery-betting` (per review).
- **Split** the old "Education, fees & other" junk-drawer group into **Education** (group 10) and
  **Fees & finance** (group 11), so each group rolls up to a meaningful total.

## Deliberate merges / drops (from Meniga)
- **Dropped whole categoryTypes:** Meniga's `Income` / `Savings` / `Excluded` (own axes, ADR-0020);
  duplicate flat entries that also appear as children.
- Golf / Veiðar / Skíði / Hestamennska → `outdoors`; Ljósmyndun / Hannyrðir / Tónlist → `hobbies`;
  Sjónvarpsefni + Tölvuleikir + Bækur → `streaming-games-books`; Listmunir/blóm/kerti, Skartgripir,
  Fatahreinsun → `clothing`/`gifts` and their group "(other)".
- **"Matur" vs "Matarinnkaup":** collapsed the Meniga group+leaf into group **Food & groceries**
  with a single `groceries` leaf.

## IS naming pass — full forms (shown short in the table for chip-fit)
`Húsgögn & tæki` = Húsgögn og heimilistæki · `Viðhald bíls` = Viðhald og rekstur bifreiða ·
`Bílalán` = Bílalán og rekstrarleiga · `Strætó & taxi` = Leigubílar, strætó, samgöngur ·
`Lyf & apótek` = Lyf og lækningavörur · `Læknar` = Læknar og tannlæknar ·
`Líkamsrækt` = Líkamsrækt og íþróttir · `Hársnyrting` = Hár og snyrting ·
`Líftrygging` = Líf- og sjúkdómatryggingar · `Leikskóli & gæsla` = Skólagjöld og barnagæsla ·
`Bíó & tónleikar` = Bíó, leikhús, tónleikar · `Streymi & leikir` = Sjónvarpsefni, tónlist, tölvuleikir og bækur ·
`Flug` = Flug og samgöngur í fríi · `Gisting` = Hótel og gisting · `Matur á ferð` = Matur og uppihald í fríi ·
`Skólagjöld` = Skóla- og námsskeiðsgjöld · `Námsgögn` = Skólabækur, efni og ritföng ·
`Bankagjöld` = Bankakostnaður og þjónustugjöld.

## Still open (fine to leave as-is)
- **Icons** provisional until validated against installed `lucide-react` (a few — `paw-print`,
  `plug-zap`, `tent-tree`, `banknote-arrow-down` — are newer additions).
- 58 leaves is the current size; households can `hide`/`add` from here.
