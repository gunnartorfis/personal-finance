import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema (ADR-0002: Household is the tenant boundary).
 *
 * Every financial row is keyed by `household_id`. Cross-table references additionally use
 * COMPOSITE foreign keys that include `household_id`, so a child row can only reference a parent
 * in the same household — tenant isolation is enforced by the database, not just the app layer.
 */

/** A Household's subscription level (ADR-0002/0006). */
export const planEnum = pgEnum("plan", ["Free", "Premium"]);

/**
 * The tenant: a couple or family sharing one financial picture. Holds the Plan (ADR-0006) and the
 * single billing currency used for all net math (ADR-0004: one billing currency per Household in
 * v1, so it lives here rather than per-Account).
 */
export const households = pgTable(
  "households",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plan: planEnum("plan").notNull().default("Free"),
    /** When the Premium plan next renews; null on Free. */
    planRenewsAt: timestamp("plan_renews_at", { withTimezone: true }),
    /** ISO 4217 billing currency; the charged amount is the sole source of truth for net math. */
    billingCurrency: text("billing_currency").notNull().default("ISK"),
    /** Adyen recurringDetailReference (stored card token) for renewal charges; null until set. */
    straumurRecurringDetailReference: text("straumur_recurring_detail_reference"),
    /** Billing period of the active subscription; drives the renewal amount + cadence. Null on Free. */
    subscriptionPeriod: text("subscription_period"),
    /** Consecutive failed renewal charges; drives dunning. Reset to 0 on success / downgrade. */
    renewalFailureCount: integer("renewal_failure_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // A Free household never carries a renewal date (prevents stray charges / dunning on Free).
    check("households_free_has_no_renewal", sql`${t.plan} <> 'Free' OR ${t.planRenewsAt} IS NULL`),
    // Likewise a Free household carries no subscription period. NOTE: any downgrade to Free (cancel
    // / dunning) MUST null subscriptionPeriod (and planRenewsAt) in the same UPDATE, or this CHECK
    // rejects it — the symmetry of activation, which sets both together.
    check("households_free_has_no_period", sql`${t.plan} <> 'Free' OR ${t.subscriptionPeriod} IS NULL`),
    // The subscription period, when set, is one of the known billing periods.
    check(
      "households_subscription_period_valid",
      sql`${t.subscriptionPeriod} IS NULL OR ${t.subscriptionPeriod} IN ('monthly', 'annual')`,
    ),
    // Billing currency is a normalized ISO 4217 code: exactly three uppercase letters.
    check("households_billing_currency_iso4217", sql`${t.billingCurrency} ~ '^[A-Z]{3}$'`),
  ],
);

/** A signed-in user belonging to a Household, linked to a Stack Auth user (ADR-0001/0002). */
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The Stack Auth user id this Member maps to. */
    authUserId: text("auth_user_id").notNull().unique(),
    /**
     * The Member's chosen Locale (`is`/`en`); `null` = not chosen, so locale
     * resolution falls through to geo / Accept-Language (ADR-0013). Validated in
     * the app via `toLocale`; kept as free text to avoid a DB enum migration.
     */
    locale: text("locale"),
    /**
     * When this Member opted out of the Digest (#102, ADR-0019); `null` = subscribed (opt-out
     * model, on by default). Set by the unsubscribe link / settings toggle, cleared on re-subscribe.
     */
    digestUnsubscribedAt: timestamp("digest_unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Target for composite same-household foreign keys from upload/override actor columns.
  (t) => [unique("members_household_id_id_key").on(t.householdId, t.id)],
);

/** Lifecycle of a Household Invite (ADR-0010). Expiry is DERIVED from `expiresAt`, not a stored state. */
export const inviteStatusEnum = pgEnum("invite_status", ["pending", "accepted", "revoked"]);

/**
 * A pending, email-addressed offer to join an existing Household (ADR-0010).
 *
 * App-owned (not the Neon Auth org plugin): the Household DB row stays the single source of truth.
 * The raw token lives only in the shared invite link; only its SHA-256 (`tokenHash`) is stored.
 * Redemption is bound to `email` — the redeemer's *verified* session email must match (case-
 * insensitive; `email` is stored lower-cased) — and inserts a Member into THIS Household. A partial
 * unique index keeps at most one `pending` invite per (Household, email) so re-inviting is idempotent.
 * "Active" means `status = 'pending' AND expiresAt > now()`; expiry needs no sweep — it is read off
 * `expiresAt`. On leave, the app nulls `invitedByMemberId` (composite FK is NO ACTION, like uploads).
 */
export const householdInvites = pgTable(
  "household_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Lower-cased invitee email; the identity the Invite is bound to. */
    email: text("email").notNull(),
    /** SHA-256 (hex) of the random invite token. The raw token is never stored — only in the link. */
    tokenHash: text("token_hash").notNull().unique(),
    /** The Member who created the Invite (same Household); nulled by the app if they leave. */
    invitedByMemberId: uuid("invited_by_member_id"),
    status: inviteStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  },
  (t) => [
    // The inviter Member must belong to the same Household (NO ACTION; see uploads importer note).
    foreignKey({
      columns: [t.householdId, t.invitedByMemberId],
      foreignColumns: [members.householdId, members.id],
      name: "household_invites_inviter_household_fk",
    }),
    // Email is stored normalized (lower-cased) so the redeem-time match is a plain equality.
    check("household_invites_email_lowercase", sql`${t.email} = lower(${t.email})`),
    // An accepted Invite always records when it was accepted.
    check(
      "household_invites_accepted_has_timestamp",
      sql`${t.status} <> 'accepted' OR ${t.acceptedAt} IS NOT NULL`,
    ),
    // At most one live (pending) Invite per (Household, email) — the DB backstop for idempotent re-invite.
    uniqueIndex("household_invites_household_email_pending_key")
      .on(t.householdId, t.email)
      .where(sql`${t.status} = 'pending'`),
    // Provisioning intercept looks up a signing-in user's pending Invites by email (cross-Household).
    index("household_invites_email_pending_idx")
      .on(t.email)
      .where(sql`${t.status} = 'pending'`),
  ],
);

/**
 * Append-only idempotency ledger for the monthly Digest (#102, ADR-0019). Exactly one row per
 * (Member, Statement cycle): the cron inserts a row as it sends, and the UNIQUE(member_id, cycle_key)
 * makes a retried or double-fired run a no-op instead of a double-send. Not an audit trail (that is
 * the Activity log, which the Digest never writes) — pure send-dedup bookkeeping, so it cascades away
 * with the Member. `cycle_key` is the `YYYY-MM` Statement-cycle key.
 */
export const digestSends = pgTable(
  "digest_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull(),
    /** The Statement-cycle key the Digest covered, `YYYY-MM`. */
    cycleKey: text("cycle_key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Tenant isolation: the Member must belong to the same Household (composite FK); cascade so a
    // departed Member's send bookkeeping is cleaned up (unlike the Activity log, this is not audit).
    foreignKey({
      columns: [t.householdId, t.memberId],
      foreignColumns: [members.householdId, members.id],
      name: "digest_sends_member_household_fk",
    }).onDelete("cascade"),
    // At most one Digest per (Member, cycle) — the DB backstop that makes the cron idempotent.
    unique("digest_sends_member_cycle_key").on(t.memberId, t.cycleKey),
    // `cycle_key` is a Statement-cycle key `YYYY-MM`: four-digit year, a real month 01–12. A tight
    // month range (not just `[0-9]{2}`) means a misbehaving cron can't insert a `2026-00`/`2026-13`
    // row that would never match a real cycle and silently defeat the idempotency backstop.
    check("digest_sends_cycle_key_format", sql`${t.cycleKey} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

/** The lifecycle/health of a Bank connection's PSD2 consent (open-banking auto-sync). */
export const bankConnectionStatusEnum = pgEnum("bank_connection_status", [
  "active",
  "expiring",
  "expired",
  "error",
  "revoked",
]);

/**
 * A Household's authorized link to one bank via an open-banking aggregator (Enable Banking). Holds
 * the PSD2 consent (which expires — SCA re-consent ~every 90 days). The consent/session handle
 * (`providerConnectionId`) is stored plaintext — it is unusable without the app's Enable Banking RSA
 * key + application id. Aggregator bearer tokens are never persisted: no write path exposes
 * `accessToken`/`refreshToken` (see the repo layer). One connection exposes one or more {@link accounts}.
 */
export const bankConnections = pgTable(
  "bank_connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The aggregator, e.g. "enable_banking". */
    provider: text("provider").notNull(),
    /** The aggregator's consent/session id for this connection. */
    providerConnectionId: text("provider_connection_id").notNull(),
    /** Bank identifier + display name from the aggregator (e.g. "LANDSBANKINN"). */
    institutionId: text("institution_id"),
    institutionName: text("institution_name"),
    status: bankConnectionStatusEnum("status").notNull().default("active"),
    /** When the PSD2 consent expires and SCA re-consent is required. */
    consentExpiresAt: timestamp("consent_expires_at", { withTimezone: true }),
    /**
     * Reserved: aggregator access/refresh tokens. Never written today — the repo layer exposes no
     * write path. If persisting them ever becomes necessary, add app-layer encryption first (do not
     * write raw bearer tokens).
     */
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target for the composite same-household FK from accounts.
    unique("bank_connections_household_id_id_key").on(t.householdId, t.id),
    // One connection per (provider, consent) within a Household.
    unique("bank_connections_household_provider_conn_key").on(
      t.householdId,
      t.provider,
      t.providerConnectionId,
    ),
  ],
);

/**
 * Short-lived binding created when a bank connection is started, so the OAuth callback can resolve
 * which Household (and institution) the flow belongs to WITHOUT the interactive auth session — the
 * bank redirects back cross-site and the session cookie isn't guaranteed to ride along. Keyed by the
 * unguessable random `state` (also echoed in the CSRF cookie); consumed (deleted) on callback.
 */
export const bankConnectionIntents = pgTable("bank_connection_intents", {
  /** The OAuth `state` — random, unguessable; the lookup key from the callback. */
  state: text("state").primaryKey(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  /** The institution the user chose at start, carried through so reconnect/persist has the name. */
  institutionName: text("institution_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A card or bank account within a Household; the provenance of every Transaction (ADR-0004).
 * Its billing currency is the Household's (one per Household in v1), so it is not stored here.
 *
 * Every Household is provisioned with exactly one `isDefault` account (see
 * `lib/household/default-account.ts`); it is the pre-selected pick in the upload flow and the only
 * account when a Household hasn't added its own. The partial unique index enforces at-most-one
 * default per Household.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    /** The Bank connection this account was discovered through; null for manual/CSV accounts. */
    connectionId: uuid("connection_id"),
    /** The aggregator's account id, for synced accounts; null for manual/CSV. */
    externalAccountId: text("external_account_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target for composite same-household foreign keys from uploads/transactions.
    unique("accounts_household_id_id_key").on(t.householdId, t.id),
    // At most one default account per Household.
    uniqueIndex("accounts_one_default_per_household")
      .on(t.householdId)
      .where(sql`${t.isDefault}`),
    // A synced Account's Bank connection must belong to the same Household (NO ACTION: the app
    // nulls connectionId / revokes rather than deleting a connection, so historical rows survive).
    foreignKey({
      columns: [t.householdId, t.connectionId],
      foreignColumns: [bankConnections.householdId, bankConnections.id],
      name: "accounts_connection_household_fk",
    }),
    // Idempotent synced-account discovery: at most one Account per (connection, aggregator account).
    // Partial so manual/CSV accounts (connectionId null) are unconstrained. Backs the DB-level guard
    // for the check-then-create in account discovery so concurrent callbacks can't duplicate a row.
    uniqueIndex("accounts_synced_external_key")
      .on(t.householdId, t.connectionId, t.externalAccountId)
      .where(sql`${t.connectionId} IS NOT NULL`),
  ],
);

/** Where an Account balance snapshot came from: a Member's manual entry, or an automatic bank sync. */
export const balanceSourceEnum = pgEnum("balance_source", ["manual", "bank_sync"]);

/**
 * Append-only Account balance snapshots (ADR-0016): each row is one observation of an Account's
 * balance at a point in time, never updated in place. Net worth reads the latest snapshot per
 * Account and sums them; keeping the full history means a future bank-balance sync just inserts new
 * rows on the same table. Balances are whole billing-currency units (ADR-0004) and MAY be negative —
 * an overdraft or a credit-card balance is real debt that reduces net worth.
 */
export const accountBalances = pgTable(
  "account_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    /** The observed balance in whole billing-currency units; negative for overdrafts / card debt. */
    balance: integer("balance").notNull(),
    /** When the balance was observed (manual entry stamps "now"; a sync stamps the provider's time). */
    asOf: timestamp("as_of", { withTimezone: true }).notNull().defaultNow(),
    source: balanceSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The Account must belong to the same Household as the snapshot (composite same-household FK, as
    // uploads/transactions do). NO ACTION: accounts are not hard-deleted out from under history.
    foreignKey({
      columns: [t.householdId, t.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
      name: "account_balances_account_household_fk",
    }),
    // Backs the latest-per-account lookup (DISTINCT ON account, newest first) for net worth.
    // Includes created_at so the exact-`as_of`-tie tiebreak stays a pure index scan (no heap fetch).
    index("account_balances_latest_idx").on(
      t.householdId,
      t.accountId,
      t.asOf.desc(),
      t.createdAt.desc(),
    ),
  ],
);

/** The lifecycle of a Transaction's classification (ADR-0005). */
export const classificationStatusEnum = pgEnum("classification_status", [
  "pending",
  "classified",
  "failed",
]);

/** Where a Transaction came from: a CSV {@link uploads} import, or an automatic bank sync. */
export const ingestionSourceEnum = pgEnum("ingestion_source", ["csv", "bank_sync"]);

/** One CSV import into a Household: the file, the Account its rows belong to, and the importer. */
export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    /** The Member who uploaded (same Household); nulled by the app if they leave (ADR-0002). */
    importedByMemberId: uuid("imported_by_member_id"),
    fileName: text("file_name").notNull(),
    /** SHA-256 of the raw bytes — the exact-file import guard (ADR-0003). */
    fileHash: text("file_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The Account must belong to the same Household as the Upload.
    foreignKey({
      columns: [t.householdId, t.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
      name: "uploads_account_household_fk",
    }).onDelete("cascade"),
    // The importer Member must belong to the same Household (NO ACTION: a household-wide
    // cascade still succeeds; deleting a lone Member requires the app to null this first).
    foreignKey({
      columns: [t.householdId, t.importedByMemberId],
      foreignColumns: [members.householdId, members.id],
      name: "uploads_importer_household_fk",
    }),
    // Target for the composite same-household FK from transactions.
    unique("uploads_household_id_id_key").on(t.householdId, t.id),
    // One import of a given file per Household (the exact-file guard, enforced at the DB).
    unique("uploads_household_id_file_hash_key").on(t.householdId, t.fileHash),
  ],
);

/**
 * A Household's semantic Category (ADR-0020, #105) — the "what was bought" axis, orthogonal to the
 * discretionary Expense type. Two levels: a **group** row (`parent_id` NULL) rolls up **leaf** rows
 * that Transactions attach to. Seeded per-Household from `CATEGORY_SEED` (`lib/categories/seed.ts`);
 * a Household may hide seed rows or add its own. Seed rows carry an i18n `label_key` (localized,
 * `label` NULL); custom rows carry a literal `label` (`label_key` NULL). Expenses-only (ADR-0020) —
 * credits/income/transfers/savings stay in their own models and never carry a Category.
 *
 * Declared before `transactions` because a Transaction's composite Category FK references it.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Parent group for a leaf subcategory; NULL on a top-level group row. */
    parentId: uuid("parent_id"),
    /** Stable identifier, unique within the Household (seed slug, or a generated custom slug). */
    slug: text("slug").notNull(),
    /** i18n message key (namespace `categories`) for seed rows; NULL on custom rows. */
    labelKey: text("label_key"),
    /** Literal display label for custom rows; NULL on seed rows (which localize via `label_key`). */
    label: text("label"),
    /** Fallback discretionary Expense type (leaf rows); a hint only (ADR-0020). NULL on groups. */
    defaultExpenseType: text("default_expense_type"),
    /** Lucide icon name (kebab-case). */
    icon: text("icon"),
    /** Icelandic classifier / merchant-match hints (diacritic-folded at match time). */
    synonyms: jsonb("synonyms").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** True for rows seeded from CATEGORY_SEED; false for Household-created rows. */
    isSeed: boolean("is_seed").notNull().default(false),
    /** The Household hid this Category from pickers and breakdowns (soft, reversible). */
    hidden: boolean("hidden").notNull().default(false),
    /** Display order within the parent group (or among groups). */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Mutable table (hide / reorder / rename), so it carries updated_at like columnMappings and
    // assistantConversations; the app bumps it on write.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target for the composite same-Household self FK below.
    unique("categories_household_id_id_key").on(t.householdId, t.id),
    // Slug is the stable per-Household identifier.
    unique("categories_household_slug_key").on(t.householdId, t.slug),
    // A leaf's parent group must belong to the same Household (self-referential composite FK).
    foreignKey({
      columns: [t.householdId, t.parentId],
      foreignColumns: [t.householdId, t.id],
      name: "categories_parent_household_fk",
    }).onDelete("cascade"),
    index("categories_household_parent_idx").on(t.householdId, t.parentId),
    // Exactly one label source: seed rows localize via `label_key`; custom rows carry `label`.
    check(
      "categories_label_source",
      sql`(${t.labelKey} IS NOT NULL AND ${t.label} IS NULL) OR (${t.labelKey} IS NULL AND ${t.label} IS NOT NULL)`,
    ),
    // A group row (parent_id NULL) never carries a default Expense type; a leaf's fallback, when
    // set, is a real discretionary bucket (never "" — categories are Expenses-only, ADR-0020).
    check(
      "categories_default_expense_type_valid",
      sql`${t.defaultExpenseType} IS NULL OR (${t.parentId} IS NOT NULL AND ${t.defaultExpenseType} IN ('Fixed', 'Necessary', 'Nice to have'))`,
    ),
    // No self-parenting. The 2-level invariant (no grandchildren) can't be a CHECK — Postgres
    // CHECKs can't reference other rows — so it is enforced by seeding and by the create-category
    // app guard (a new leaf's parent must itself be a group), per ADR-0020.
    check("categories_no_self_parent", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
);

/**
 * One line from an Upload (ADR-0003/0004/0005). Append-only with a DB-generated PK; `sourceRow`
 * keeps the CSV row index for traceability. `amount` is the charged amount in the Household's
 * billing currency (the sole source of truth); `originalAmount`/`originalCurrency` are the foreign
 * pre-conversion amount, display-only. Classification is drained asynchronously.
 */
export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    /** The CSV Upload this row came from; null for synced (bank_sync) rows. */
    uploadId: uuid("upload_id"),
    /** Ingestion provenance: a CSV Upload or an automatic bank sync. */
    source: ingestionSourceEnum("source").notNull().default("csv"),
    /** The aggregator's stable transaction id, for synced rows; null for CSV. The dedup key. */
    externalId: text("external_id"),
    date: date("date").notNull(),
    /** Charged amount in the Household's billing currency; negative = expense. */
    amount: integer("amount").notNull(),
    /**
     * The Household's Own share of a Shared expense (ADR-0014): the portion of a debit it actually
     * bears when it fronted the rest for other parties (a group gift split across couples). Negative,
     * with `amount <= own_share_amount < 0`. Null on an ordinary Transaction. Never mutates the
     * charged `amount` (the append-only source of truth); it only shrinks how much counts as spend.
     */
    ownShareAmount: integer("own_share_amount"),
    /**
     * The amount that counts as spend: the Own share when set, else the charged `amount` (ADR-0014).
     * A STORED generated column so every spend/net/savings aggregation reads one DB-computed value
     * and can't drift. Equals `amount` for all credits and non-shared debits (Own share is null),
     * so switching a spend query to it is always safe. NOT used for classification, Merchant-rule
     * matching, the review queue, or the displayed charge — those read the true `amount`.
     */
    effectiveAmount: integer("effective_amount")
      .notNull()
      .generatedAlwaysAs(sql`coalesce(own_share_amount, amount)`),
    /** Foreign pre-conversion amount, display-only; never summed into net. */
    originalAmount: numeric("original_amount"),
    originalCurrency: text("original_currency"),
    merchant: text("merchant").notNull(),
    rawCategory: text("raw_category").notNull(),
    /** CSV row index for traceability; null for synced rows (which use externalId instead). */
    sourceRow: integer("source_row"),
    classificationStatus: classificationStatusEnum("classification_status")
      .notNull()
      .default("pending"),
    /** Expense type once classified ("" = not bucketed); null while pending/failed. */
    expenseType: text("expense_type"),
    confidence: real("confidence"),
    reasoning: text("reasoning"),
    /**
     * Semantic Category (ADR-0020), orthogonal to `expenseType`. Null = Uncategorized (model
     * abstained, not yet processed, or a credit/transfer — which never carry a Category). Resolved
     * on its own precedence chain (Override > Merchant rule > Classification). Always a **leaf**
     * subcategory: leaf-only can't be a CHECK (it depends on the referenced row's `parent_id`, a
     * cross-row read Postgres CHECKs forbid — same limit as `categories_no_self_parent`), so it is
     * enforced by the assignment layer (worker / merchant rule / override all resolve to leaf ids).
     */
    categoryId: uuid("category_id"),
    /** Model confidence for the Category assignment (0..1); independent of `confidence` (Expense type). */
    categoryConfidence: real("category_confidence"),
    /**
     * A Member manually marked this credit as real income. Credits are excluded from every
     * calculation unless this is set — most card credits are inter-account transfers, card-bill
     * payments, or refunds, not revenue (ADR-0009).
     */
    incomeMarked: boolean("income_marked").notNull().default(false),
    /**
     * A Member dropped this Transaction from every calculation — Spending, Income, Difference,
     * spend series, expense-type buckets, and Inferred saving (ADR-0011). Unlike income marking it
     * applies to any sign: a debit that is not true household spending (reimbursed by someone else,
     * a mistaken charge, a cost fronted for another party — the "grandma's vacuum"), or a credit
     * whose exclusion a Member wants recorded explicitly. Mutually exclusive with `incomeMarked`.
     */
    excluded: boolean("excluded").notNull().default(false),
    /** Optional free-text reason shown on the excluded row (e.g. "grandma's vacuum"); null otherwise. */
    exclusionNote: text("exclusion_note"),
    /**
     * Links the two legs of a detected inter-account transfer — a money-out leg in a funding Account
     * and the equal-and-opposite money-in leg it landed as in another (a card-bill payment, a savings
     * sweep). Both legs carry the same group id (issue #97). A row with a group id is money movement
     * between the Household's own accounts, not spend or income, so it is dropped from every
     * spend/income/Difference aggregation — the same effect as `excluded`, but auto-detected and
     * paired rather than a Member's manual call. Null on an ordinary Transaction.
     */
    transferGroupId: uuid("transfer_group_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Only a credit (amount > 0) can be marked as income; debits are always spending.
    check(
      "transactions_income_marked_credit_only",
      sql`NOT ${t.incomeMarked} OR ${t.amount} > 0`,
    ),
    // A row is in exactly one net state: Spending, Income (marked), or Excluded — never both of the
    // last two (ADR-0011).
    check(
      "transactions_excluded_not_income",
      sql`NOT (${t.excluded} AND ${t.incomeMarked})`,
    ),
    // An exclusion note only makes sense on an excluded row; forbid a dangling note.
    check(
      "transactions_exclusion_note_requires_excluded",
      sql`${t.exclusionNote} IS NULL OR ${t.excluded}`,
    ),
    // Bound the note length at the DB too, so a direct insert / seed can't bypass the API's cap.
    check(
      "transactions_exclusion_note_length",
      sql`${t.exclusionNote} IS NULL OR char_length(${t.exclusionNote}) <= 280`,
    ),
    // A row has an Expense type iff it is classified ("" counts); pending/failed carry none.
    check(
      "transactions_classified_has_type",
      sql`(${t.classificationStatus} = 'classified') = (${t.expenseType} IS NOT NULL)`,
    ),
    // Own share (ADR-0014) is a debit-only, nonzero portion no larger than the charge: when set,
    // amount < 0 and amount <= own_share_amount < 0. A share of 0 is Excluded instead.
    check(
      "transactions_own_share_debit_bounds",
      sql`${t.ownShareAmount} IS NULL OR (${t.amount} < 0 AND ${t.ownShareAmount} >= ${t.amount} AND ${t.ownShareAmount} < 0)`,
    ),
    // A Shared expense and Excluded are mutually exclusive: excluding drops the whole row, so it
    // clears any Own share (ADR-0011/0014), mirroring how excluding clears income_marked.
    check(
      "transactions_own_share_not_excluded",
      sql`NOT (${t.ownShareAmount} IS NOT NULL AND ${t.excluded})`,
    ),
    // Expense type, when set, is one of the known buckets ("" = not bucketed).
    check(
      "transactions_expense_type_valid",
      sql`${t.expenseType} IS NULL OR ${t.expenseType} IN ('Fixed', 'Necessary', 'Nice to have', '')`,
    ),
    // A foreign original amount and its currency are present together or not at all.
    check(
      "transactions_original_amount_currency",
      sql`(${t.originalAmount} IS NULL) = (${t.originalCurrency} IS NULL)`,
    ),
    // The Account and Upload must belong to the same Household as the Transaction.
    foreignKey({
      columns: [t.householdId, t.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
      name: "transactions_account_household_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.householdId, t.uploadId],
      foreignColumns: [uploads.householdId, uploads.id],
      name: "transactions_upload_household_fk",
    }).onDelete("cascade"),
    // A Transaction's Category must belong to the same Household (ADR-0020). No onDelete action: a
    // referenced Category can't be individually deleted (v1 customization is hide-only), while a
    // whole-Household delete still cascades both sides (NO ACTION is checked at statement end).
    foreignKey({
      columns: [t.householdId, t.categoryId],
      foreignColumns: [categories.householdId, categories.id],
      name: "transactions_category_household_fk",
    }),
    // Speeds the Category-breakdown aggregations (group/filter by category within a Household).
    index("transactions_household_category_idx").on(t.householdId, t.categoryId),
    // Category confidence only accompanies an assigned Category, and is a probability in [0, 1].
    check(
      "transactions_category_confidence_requires_category",
      sql`${t.categoryConfidence} IS NULL OR ${t.categoryId} IS NOT NULL`,
    ),
    check(
      "transactions_category_confidence_range",
      sql`${t.categoryConfidence} IS NULL OR (${t.categoryConfidence} >= 0 AND ${t.categoryConfidence} <= 1)`,
    ),
    // Provenance integrity: a CSV row carries an Upload and no external id; a synced row carries an
    // external id and no Upload.
    check(
      "transactions_source_provenance",
      sql`(${t.source} = 'csv' AND ${t.uploadId} IS NOT NULL AND ${t.externalId} IS NULL AND ${t.sourceRow} IS NOT NULL)
        OR (${t.source} = 'bank_sync' AND ${t.uploadId} IS NULL AND ${t.externalId} IS NOT NULL AND ${t.sourceRow} IS NULL)`,
    ),
    // Idempotent dedup for synced rows: one row per (household, account, provider transaction id).
    // Partial so CSV rows (external id null) are unconstrained.
    uniqueIndex("transactions_household_account_external_key")
      .on(t.householdId, t.accountId, t.externalId)
      .where(sql`${t.externalId} IS NOT NULL`),
    // Target for the composite same-household FK from overrides.
    unique("transactions_household_id_id_key").on(t.householdId, t.id),
    // Transfer legs are a tiny minority; a partial index lets aggregations that filter
    // `transfer_group_id IS NULL` and group-id lookups (backfill/unlink) skip a full scan (#97).
    index("transactions_transfer_group_id_idx")
      .on(t.transferGroupId)
      .where(sql`${t.transferGroupId} IS NOT NULL`),
  ],
);

/** A Member's manual Expense-type change to a Transaction; overrides the classified type. */
export const overrides = pgTable(
  "overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Keyed off the real Transaction PK (ADR-0003); one override per Transaction. */
    transactionId: uuid("transaction_id").notNull().unique(),
    /** The Member who made the override (same Household); nulled by the app if they leave. */
    memberId: uuid("member_id"),
    expenseType: text("expense_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "overrides_expense_type_valid",
      sql`${t.expenseType} IN ('Fixed', 'Necessary', 'Nice to have', '')`,
    ),
    // The Transaction must belong to the same Household as the Override.
    foreignKey({
      columns: [t.householdId, t.transactionId],
      foreignColumns: [transactions.householdId, transactions.id],
      name: "overrides_transaction_household_fk",
    }).onDelete("cascade"),
    // The actor Member must belong to the same Household (NO ACTION; see uploads importer note).
    foreignKey({
      columns: [t.householdId, t.memberId],
      foreignColumns: [members.householdId, members.id],
      name: "overrides_member_household_fk",
    }),
  ],
);

/**
 * A household-level deterministic mapping from a (normalized) merchant to an Expense type,
 * applied before AI classification (ADR-0005, `CONTEXT.md`). `merchant` stores the normalized
 * key (see `shared/merchant-rules.ts`). A rule is either FLAT (`flatType`) or a SPLIT by charge
 * magnitude (`threshold` + `atOrAboveType`/`belowType`) — exactly one shape, enforced by CHECK.
 */
export const merchantRules = pgTable(
  "merchant_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Normalized merchant key this rule matches. */
    merchant: text("merchant").notNull(),
    /** Flat rule: the Expense type to assign. Null for split rules. */
    flatType: text("flat_type"),
    /** Split rule: charge-magnitude threshold (`|amount| >= threshold`). Null for flat rules. */
    threshold: integer("threshold"),
    atOrAboveType: text("at_or_above_type"),
    belowType: text("below_type"),
    /**
     * Optional semantic Category leaf (ADR-0020) applied alongside the Expense type on a match.
     * A single value regardless of the flat/split shape — a merchant's Category doesn't vary by
     * amount, so there is no threshold-split form for the Category (unlike the Expense type). Null =
     * the rule sets no Category (the row's Category still comes from Classification / Override).
     */
    categoryId: uuid("category_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One rule per normalized merchant per Household.
    unique("merchant_rules_household_id_merchant_key").on(t.householdId, t.merchant),
    // The Category, when set, must be one of this Household's own (composite tenant FK, ADR-0020).
    foreignKey({
      columns: [t.householdId, t.categoryId],
      foreignColumns: [categories.householdId, categories.id],
      name: "merchant_rules_category_household_fk",
    }),
    // Exactly one shape: flat (only flatType) XOR split (threshold + both branch types).
    check(
      "merchant_rules_one_shape",
      sql`(
        ${t.flatType} IS NOT NULL AND ${t.threshold} IS NULL
          AND ${t.atOrAboveType} IS NULL AND ${t.belowType} IS NULL
      ) OR (
        ${t.flatType} IS NULL AND ${t.threshold} IS NOT NULL
          AND ${t.atOrAboveType} IS NOT NULL AND ${t.belowType} IS NOT NULL
      )`,
    ),
    // Every set type column is one of the known buckets ("" = not bucketed).
    check(
      "merchant_rules_types_valid",
      sql`(${t.flatType} IS NULL OR ${t.flatType} IN ('Fixed', 'Necessary', 'Nice to have', ''))
        AND (${t.atOrAboveType} IS NULL OR ${t.atOrAboveType} IN ('Fixed', 'Necessary', 'Nice to have', ''))
        AND (${t.belowType} IS NULL OR ${t.belowType} IN ('Fixed', 'Necessary', 'Nice to have', ''))`,
    ),
    // A split threshold is a positive magnitude (0 would make the at-or-above branch always fire).
    check("merchant_rules_threshold_positive", sql`${t.threshold} IS NULL OR ${t.threshold} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// columnMappings — a Household's remembered CSV column mappings (ADR-0018)
// ---------------------------------------------------------------------------

/**
 * A confirmed column mapping remembered per Household, keyed by a normalized header signature (the
 * ordered, folded list of the file's column labels — see `headerSignature`). Replayed on the next
 * upload of a file with the same shape so a bank's format is taught once, then imports silently.
 * Belongs to the file's shape, not an Account, so two Accounts of the same bank share it.
 */
export const columnMappings = pgTable(
  "column_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Normalized signature of the file's header labels. */
    headerSignature: text("header_signature").notNull(),
    /** Confirmed role → 0-based column index for files of this shape. */
    columns: jsonb("columns")
      .$type<Record<"date" | "amount" | "merchant" | "category", number>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One remembered mapping per file shape per Household (upsert target).
    unique("column_mappings_household_id_header_signature_key").on(t.householdId, t.headerSignature),
  ],
);

// ---------------------------------------------------------------------------
// straumurPayments — webhook-sourced Straumur/Adyen payment records (ADR-0006)
// ---------------------------------------------------------------------------
// Authoritative record of `Authorization` (and related) events received via Straumur's payment
// webhook. The session status poll returns only a coarse status; pspReference, amount, currency,
// and the recurring token arrive here. Idempotent on pspReference: re-receiving the same event
// patches the existing row rather than inserting a duplicate.
//
// The webhook is externally sourced, so `householdId` is a best-effort parse of our own
// merchantReference (`sub_{householdId}_…`) and is intentionally nullable and unconstrained — an
// unrecognised reference is still recorded for diagnostics rather than rejected.
export const straumurPayments = pgTable("straumur_payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id"),
  pspReference: text("psp_reference").notNull().unique(),
  merchantReference: text("merchant_reference"),
  checkoutReference: text("checkout_reference"),
  /** Adyen recurringDetailReference / stored token, when present — used for renewal charges. */
  recurringDetailReference: text("recurring_detail_reference"),
  amount: integer("amount").notNull(), // minor units, as received from the webhook
  currency: text("currency").notNull(),
  success: boolean("success").notNull(),
  eventCode: text("event_code").notNull(),
  reason: text("reason"),
  rawEvent: text("raw_event"), // capped diagnostic copy of the payload
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Savings goals (ADR-0007): a Household tracks progress toward a target amount by a target date,
// with progress INFERRED from spend (never an entered balance). These tables hold the goal, the
// Household's configured Monthly income + Off-card fixed costs, and the frozen per-cycle Check-in
// snapshots. Every row is keyed by household_id (cascade); none reference another tenant-scoped
// table, so a plain household FK is sufficient (no composite same-household FK needed here).
// ---------------------------------------------------------------------------

/** A Household's Savings goal (ADR-0007). One active goal per Household in v1. */
export const savingsGoals = pgTable(
  "savings_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** Optional display name for the goal (e.g. "Wedding", "New car") — chrome, never math. */
    title: text("title"),
    /** Amount to accumulate by the target date, in whole billing-currency units. */
    target: integer("target").notNull(),
    /** The date the amount must be reached by. */
    targetDate: date("target_date").notNull(),
    /** Amount already saved at the start cycle (0 when starting from scratch). */
    startingSaved: integer("starting_saved").notNull().default(0),
    /** Statement-cycle key (`YYYY-MM`) the goal starts counting from. */
    startCycle: text("start_cycle").notNull(),
    /** ISO 4217 goal currency (the Household's billing currency; no FX in v1). */
    currency: text("currency").notNull().default("ISK"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One active Savings goal per Household (v1).
    unique("savings_goals_household_id_key").on(t.householdId),
    check("savings_goals_target_positive", sql`${t.target} > 0`),
    check("savings_goals_starting_saved_nonneg", sql`${t.startingSaved} >= 0`),
    // Start cycle is a well-formed Statement-cycle key: YYYY-MM, month 01–12.
    check("savings_goals_start_cycle_format", sql`${t.startCycle} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
    check("savings_goals_currency_iso4217", sql`${t.currency} ~ '^[A-Z]{3}$'`),
    // A set title is non-empty and capped at 60 chars; NULL (no title) is always allowed.
    check(
      "savings_goals_title_len",
      sql`${t.title} is null or char_length(${t.title}) between 1 and 60`,
    ),
    // The target date must fall after the start cycle begins — a goal cannot be already expired at
    // creation, which would drive cyclesRemaining <= 0 in the downstream savings math.
    check(
      "savings_goals_target_after_start_cycle",
      sql`${t.targetDate} > to_date(${t.startCycle} || '-01', 'YYYY-MM-DD')`,
    ),
  ],
);

/** A recurring monthly income source for a Household's savings math (e.g. a salary, rental income). */
export const savingsIncomeSources = pgTable(
  "savings_income_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Monthly amount in whole billing-currency units. */
    amount: integer("amount").notNull(),
    /**
     * The Statement cycle (`YYYY-MM`) this amount takes effect from, in force until a later version
     * supersedes it (ADR-0015 **Effective cycle**). Defaults to the floor sentinel `0001-01` — a
     * baseline in force from the start (`<=` every real cycle), which is how pre-ADR-0015 flat rows
     * migrate. The savings resolver reads the latest version at or before each cycle.
     */
    effectiveFrom: text("effective_from").notNull().default("0001-01"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("savings_income_sources_amount_nonneg", sql`${t.amount} >= 0`),
    check(
      "savings_income_sources_effective_from_format",
      sql`${t.effectiveFrom} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

/** A recurring monthly Off-card fixed cost (rent, loan) not present on the uploaded cards (ADR-0007). */
export const savingsOffcardCosts = pgTable(
  "savings_offcard_costs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Monthly amount in whole billing-currency units. */
    monthlyAmount: integer("monthly_amount").notNull(),
    /** Effective cycle (`YYYY-MM`) this cost takes effect from — see `savingsIncomeSources` (ADR-0015). */
    effectiveFrom: text("effective_from").notNull().default("0001-01"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("savings_offcard_costs_monthly_amount_nonneg", sql`${t.monthlyAmount} >= 0`),
    check(
      "savings_offcard_costs_effective_from_format",
      sql`${t.effectiveFrom} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

/**
 * A per-category monthly spending budget / envelope for a Household (#103). One row per real expense
 * type (Fixed / Necessary / Nice to have — never the "" not-bucketed type); the dashboard compares
 * it against actual category spend. Generalizes the savings "allowed nice-to-have" to every category.
 */
export const categoryBudgets = pgTable(
  "category_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The expense type this budget covers: 'Fixed' | 'Necessary' | 'Nice to have'. */
    expenseType: text("expense_type").notNull(),
    /** Monthly budget in whole billing-currency units. */
    monthlyAmount: integer("monthly_amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // At most one budget per (household, expense type).
    unique("category_budgets_household_type_key").on(t.householdId, t.expenseType),
    check("category_budgets_monthly_amount_positive", sql`${t.monthlyAmount} > 0`),
    // Only the real, bucketed expense types can carry a budget (never the "" split/not-bucketed type).
    check(
      "category_budgets_expense_type_valid",
      sql`${t.expenseType} IN ('Fixed', 'Necessary', 'Nice to have')`,
    ),
  ],
);

/** Whether a one-off adjustment adds to a cycle's income or its off-card cost (ADR-0015). */
export const oneOffKindEnum = pgEnum("one_off_kind", ["income", "cost"]);

/**
 * A non-recurring, single-cycle adjustment to a Household's savings inputs (ADR-0015 **One-off
 * adjustment**): a bonus/refund (`income`) or a one-time bill (`cost`), added to that cycle's
 * recurring base and affecting only that cycle. Never carries forward.
 */
export const savingsOneOffAdjustments = pgTable(
  "savings_one_off_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The Statement cycle (`YYYY-MM`) this adjustment lands on. */
    cycleKey: text("cycle_key").notNull(),
    kind: oneOffKindEnum("kind").notNull(),
    /** Whole billing-currency units, non-negative — added to that cycle's recurring base. */
    amount: integer("amount").notNull(),
    /** Optional human label (e.g. "Tax refund"); free text, exempt from net math. */
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("savings_one_off_adjustments_household_cycle_idx").on(t.householdId, t.cycleKey),
    check("savings_one_off_adjustments_amount_nonneg", sql`${t.amount} >= 0`),
    check(
      "savings_one_off_adjustments_cycle_key_format",
      sql`${t.cycleKey} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
  ],
);

/**
 * Member-facing Activity log (ADR-0017, issue #107 Trust): the Household's append-only record of
 * *who did what, when*. Every Member reads the whole log — the point is transparency between
 * partners sharing one financial picture.
 *
 * Deliberately decoupled from the financial tables so it can OUTLIVE them:
 *  - It carries **NO foreign keys to financial rows** (transactions/uploads/accounts may be deleted
 *    out from under an entry by a household data reset). Entities are referenced by id + summary
 *    inside `payload` instead.
 *  - `memberId` is a **plain uuid, not an FK**, and `actorName` is a **denormalized snapshot**, so a
 *    departed Member's history stays attributed and readable after their `members` row is gone.
 *  - The only FK is `household_id` → households (ON DELETE CASCADE): the log is removed only when
 *    the Household itself is deleted. It is intentionally EXCLUDED from the household data reset
 *    (`lib/household/reset.ts`) — a reset that erased the log would let one partner destroy the
 *    evidence of their edits, the exact failure the Trust feature exists to prevent.
 *
 * Append-only: entries are never edited or deleted while the Household exists (ADR-0003 spirit).
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The acting Member's id. PLAIN uuid, no FK: the entry survives the Member row (see above). */
    memberId: uuid("member_id").notNull(),
    /** Denormalized display name of the actor at record time — kept readable after they leave. */
    actorName: text("actor_name").notNull(),
    /** Intent-level action constant, e.g. `transaction.excluded` (recorded explicitly by routes). */
    action: text("action").notNull(),
    /** Entity id(s) + a human summary. JSON, never FKs — the referenced rows may be gone. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The member-facing list reads this Household's entries newest-first.
    index("activity_log_household_created_idx").on(t.householdId, t.createdAt.desc()),
  ],
);

// ---------------------------------------------------------------------------
// Assistant (#101, ADR-0022): a Premium-only, read-only natural-language Q&A feature.
// Conversations are Household-shared and organised as threads; each user message is attributed to
// the asking Member, assistant messages are unattributed. Read-only — these tables never mirror an
// Activity-log entry, and a data reset clears them (unlike the Activity log). See CONTEXT.md.
// ---------------------------------------------------------------------------

/** Who authored an Assistant message: the asking Member (`user`) or the model (`assistant`). */
export const assistantMessageRoleEnum = pgEnum("assistant_message_role", ["user", "assistant"]);

/**
 * One Assistant conversation (thread) belonging to a Household. Household-shared: every Member reads
 * every conversation. `startedByMemberId` attributes the thread to its opener (same-household
 * composite FK; NO ACTION, nulled by the app when that Member leaves, like `overrides`). `title` is
 * derived from the first question (see repo). The `(householdId, id)` unique key is the target of the
 * same-household composite FK from `assistantMessages`.
 */
export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    /** The Member who opened the thread (same Household); nulled by the app if they leave. */
    startedByMemberId: uuid("started_by_member_id"),
    /** Short title derived from the first question; bounded to keep list rows tidy. */
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Target for the same-household composite FK from assistantMessages.
    unique("assistant_conversations_household_id_id_key").on(t.householdId, t.id),
    // The opener Member must belong to the same Household (NO ACTION; see overrides/uploads note).
    foreignKey({
      columns: [t.householdId, t.startedByMemberId],
      foreignColumns: [members.householdId, members.id],
      name: "assistant_conversations_member_household_fk",
    }),
    // List threads newest-touched first, scoped to the Household.
    index("assistant_conversations_household_updated_idx").on(t.householdId, t.updatedAt),
    check("assistant_conversations_title_len", sql`char_length(${t.title}) BETWEEN 1 AND 200`),
  ],
);

/**
 * One message in an Assistant conversation. Only the final rendered text is stored (user question or
 * assistant answer) — tool-call internals are not persisted. `memberId` attributes a `user` message
 * to its author (same-household composite FK; NO ACTION, nulled on leave); an `assistant` message is
 * unattributed and a CHECK enforces `memberId IS NULL` for that role. The conversation FK is a
 * same-household composite FK that cascades, so deleting a thread removes its messages.
 */
export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").notNull(),
    /** Author of a `user` message (same Household); null for `assistant` messages and after leave. */
    memberId: uuid("member_id"),
    role: assistantMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // The conversation must belong to the same Household; deleting it cascades to its messages.
    foreignKey({
      columns: [t.householdId, t.conversationId],
      foreignColumns: [assistantConversations.householdId, assistantConversations.id],
      name: "assistant_messages_conversation_household_fk",
    }).onDelete("cascade"),
    // The author Member must belong to the same Household (NO ACTION; nulled by the app on leave).
    foreignKey({
      columns: [t.householdId, t.memberId],
      foreignColumns: [members.householdId, members.id],
      name: "assistant_messages_member_household_fk",
    }),
    // Load a thread in order.
    index("assistant_messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    // Serve the daily fair-use cap meter (`countMessagesSince`) as a seek, not a scan: it filters
    // (household_id, role='user', created_at) on every gated request. Partial on the counted role.
    index("assistant_messages_household_user_created_idx")
      .on(t.householdId, t.createdAt)
      .where(sql`${t.role} = 'user'`),
    // Assistant messages are never attributed to a Member.
    check(
      "assistant_messages_assistant_unattributed",
      sql`${t.role} <> 'assistant' OR ${t.memberId} IS NULL`,
    ),
    // Bound stored content (defense-in-depth against oversized input; plan 002 pattern).
    check("assistant_messages_content_len", sql`char_length(${t.content}) BETWEEN 1 AND 10000`),
  ],
);
