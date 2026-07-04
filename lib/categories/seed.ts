import type { RealType } from "@/shared/types";

/**
 * The canonical, curated Category seed taxonomy (ADR-0020, #105) — the semantic "what was bought"
 * axis, orthogonal to the discretionary {@link RealType} Expense type. Two levels: a
 * {@link SeedGroup} (dashboard rollup) contains {@link SeedSubcategory} leaves that Transactions
 * attach to. Each Household is seeded a per-Household copy of this at creation; households may then
 * hide seeds or add their own. Source of truth mirrored in `docs/category-seed-taxonomy.md`.
 *
 * `labelKey` is the i18n message key (namespace `categories`) — seed rows are localized; custom
 * household rows carry literal text instead. `icon` is a Lucide icon name (kebab-case). `synonyms`
 * are Icelandic merchant/classifier hints (matched diacritic-folded). `defaultExpenseType` is a
 * *fallback hint only* — per-Transaction Expense type stays independently assigned (ADR-0020).
 */
export interface SeedSubcategory {
  slug: string;
  labelKey: string;
  defaultExpenseType: RealType;
  icon: string;
  synonyms: readonly string[];
}

export interface SeedGroup {
  slug: string;
  labelKey: string;
  icon: string;
  children: readonly SeedSubcategory[];
}

const leaf = (
  slug: string,
  defaultExpenseType: RealType,
  icon: string,
  synonyms: readonly string[] = [],
): SeedSubcategory => ({ slug, labelKey: slug, defaultExpenseType, icon, synonyms });

export const CATEGORY_SEED: readonly SeedGroup[] = [
  {
    slug: "food",
    labelKey: "food",
    icon: "shopping-cart",
    children: [
      leaf("groceries", "Necessary", "shopping-basket", ["Bónus", "Krónan", "Nettó", "Hagkaup"]),
      leaf("restaurants", "Nice to have", "utensils"),
      leaf("fast-food", "Nice to have", "sandwich"),
      leaf("cafe", "Nice to have", "coffee"),
      leaf("bakery", "Nice to have", "croissant", ["Kökur"]),
      leaf("kiosk-sweets", "Nice to have", "candy", ["Ísbúð", "Sælgæti"]),
    ],
  },
  {
    slug: "home",
    labelKey: "home",
    icon: "house",
    children: [
      leaf("rent", "Fixed", "key-round"),
      leaf("mortgage", "Fixed", "landmark"),
      leaf("electricity-heating", "Fixed", "zap", ["Hitaveita"]),
      leaf("phone-internet", "Fixed", "wifi", ["Farsími", "Net"]),
      leaf("property-fees", "Fixed", "receipt"),
      leaf("furniture-appliances", "Nice to have", "sofa", ["Eldhústæki"]),
      leaf("home-maintenance", "Necessary", "wrench", ["Múrari", "Pípari", "Smiður"]),
      leaf("cleaning", "Necessary", "spray-can", ["Ræstingar"]),
      leaf("pets", "Necessary", "paw-print", ["Hundur", "Köttur", "Kisa"]),
    ],
  },
  {
    slug: "transport",
    labelKey: "transport",
    icon: "car",
    children: [
      leaf("fuel", "Necessary", "fuel", ["Bensín", "Dísel"]),
      leaf("car-maintenance", "Necessary", "wrench", ["Bílaviðgerðir", "Bifreiðagjöld"]),
      leaf("car-loan", "Fixed", "car-front", ["Rekstrarleiga"]),
      leaf("parking", "Necessary", "square-parking"),
      leaf("transit-taxi", "Necessary", "bus", ["Leigubíll"]),
      leaf("ev-charging", "Necessary", "plug-zap"),
    ],
  },
  {
    slug: "health",
    labelKey: "health",
    icon: "heart-pulse",
    children: [
      leaf("pharmacy", "Necessary", "pill", ["Lækningavörur"]),
      leaf("doctors-dentists", "Necessary", "stethoscope", ["Tannlæknir", "Sálfræðingur", "Sjúkraþjálfun"]),
      leaf("fitness", "Nice to have", "dumbbell", ["Sund", "Fótbolti", "Ræktin"]),
      leaf("cosmetics", "Nice to have", "sparkles"),
      leaf("hair-grooming", "Nice to have", "scissors", ["Klipping", "Rakari"]),
    ],
  },
  {
    slug: "insurance",
    labelKey: "insurance",
    icon: "shield",
    children: [
      leaf("home-insurance", "Fixed", "shield-check", ["Húseigendatrygging"]),
      leaf("car-insurance", "Fixed", "shield", ["Bifreiðatrygging"]),
      leaf("life-health-insurance", "Fixed", "shield-plus", ["Sjúkdómatrygging"]),
    ],
  },
  {
    slug: "children",
    labelKey: "children",
    icon: "baby",
    children: [
      leaf("childcare", "Fixed", "school", ["Barnapössun", "Dagmamma"]),
      leaf("childrens-clothing", "Necessary", "shirt"),
      leaf("toys-allowance", "Nice to have", "blocks", ["Vasapeningar"]),
      leaf("childrens-activities", "Nice to have", "puzzle", ["Frístundanámskeið"]),
    ],
  },
  {
    slug: "leisure",
    labelKey: "leisure",
    icon: "party-popper",
    children: [
      leaf("cinema-events", "Nice to have", "ticket", ["Kvikmyndahús", "Leikhús", "Ópera", "Sinfónía"]),
      leaf("nightlife", "Nice to have", "wine", ["Krá", "Djamm"]),
      leaf("streaming-games-books", "Nice to have", "gamepad-2", ["Netflix", "Spotify", "Bækur"]),
      leaf("hobbies", "Nice to have", "palette", ["Föndur", "Hannyrðir", "Tónlist", "Hljóðfæri", "Ljósmyndun"]),
      leaf("outdoors", "Nice to have", "tent-tree", ["Veiði", "Golf", "Skíði", "Hestamennska"]),
      leaf("lottery-betting", "Nice to have", "dices", ["Lottó", "Bingó", "Veðmál"]),
    ],
  },
  {
    slug: "travel",
    labelKey: "travel",
    icon: "plane",
    children: [
      leaf("flights", "Nice to have", "plane", ["Samgöngur í fríi"]),
      leaf("lodging", "Nice to have", "bed-double", ["Hótel", "Tjaldstæði"]),
      leaf("travel-food", "Nice to have", "utensils", ["Gjaldeyrir"]),
    ],
  },
  {
    slug: "shopping",
    labelKey: "shopping",
    icon: "shopping-bag",
    children: [
      leaf("clothing", "Nice to have", "shirt", ["Föt", "Spariföt", "Fylgihlutir"]),
      leaf("electronics", "Nice to have", "laptop", ["Tölva", "Hugbúnaður"]),
      leaf("subscriptions", "Fixed", "repeat", ["Streymisveitur", "Tímarit"]),
      leaf("gifts", "Nice to have", "gift", ["Jólagjafir", "Afmælisgjafir"]),
      leaf("alcohol", "Nice to have", "wine", ["Bjór", "Vín", "Vínbúð"]),
      leaf("tobacco", "Nice to have", "cigarette", ["Sígarettur"]),
      leaf("charity", "Nice to have", "heart-handshake", ["Ölmusa"]),
      leaf("celebrations", "Nice to have", "party-popper", ["Brúðkaup", "Ferming", "Afmæli"]),
      leaf("post-shipping", "Necessary", "package", ["Sendingar", "Burðargjald"]),
    ],
  },
  {
    slug: "education",
    labelKey: "education",
    icon: "graduation-cap",
    children: [
      leaf("tuition", "Fixed", "graduation-cap", ["Námskeið"]),
      leaf("study-materials", "Necessary", "book", ["Skólabækur", "Ritföng"]),
      leaf("student-loans", "Fixed", "landmark"),
    ],
  },
  {
    slug: "fees",
    labelKey: "fees",
    icon: "landmark",
    children: [
      leaf("bank-fees", "Necessary", "banknote", ["Greiðsluþjónusta", "Þjónustugjöld"]),
      leaf("consumer-loans", "Fixed", "hand-coins", ["Smálán"]),
      leaf("fines-interest", "Necessary", "triangle-alert", ["Vanskilakostnaður"]),
      leaf("cash-withdrawal", "Necessary", "banknote-arrow-down", ["Hraðbanki"]),
    ],
  },
];

/** Flattened leaf subcategories across every group, in seed order. */
export const CATEGORY_SEED_LEAVES: readonly SeedSubcategory[] = CATEGORY_SEED.flatMap(
  (g) => g.children,
);
