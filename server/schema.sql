-- kodo - the world's durable schema.
--
-- the shape of this follows one decision: THE EVENT LOG IS THE WORLD. every
-- block standing, every hollow burned, every monument raised is a pure
-- function of the ordered trades that funded it, so the only thing that must
-- be stored perfectly is the log — and the tick summaries derived from it,
-- because the constitution applies its rules to summaries rather than to
-- events and a hundred rows is cheaper to replay than a million.
--
-- everything else in here is either an ATTESTATION (what the world says it
-- built, so drift can be found) or a NARRATIVE (journals, marks — things
-- that are not derivable and so must be kept).

-- ---------------------------------------------------------------------------
-- the log
-- ---------------------------------------------------------------------------

-- one row per on-chain event, keyed on the transaction the chain minted.
-- THE PRIMARY KEY IS THE WHOLE DEDUPLICATION STRATEGY: a poll window
-- overlaps its predecessor, a reorg replays a block, a retry double-posts,
-- and every one of those is answered by "insert ... on conflict do nothing"
-- rather than by application logic that has to be right every time.
create table if not exists events (
  tx            text primary key,
  kind          text not null check (kind in ('buy','sell','burn','newHolder')),
  at            timestamptz not null,
  wallet        text,
  amount_usd    numeric(20,2) not null default 0,
  amount_tokens numeric(30,6) not null default 0,
  price         numeric(20,10) not null default 0,
  source        text not null,
  -- which tick this event was aggregated into. null until the ticker has
  -- closed that window, which is also how the ticker finds its work.
  tick          integer,
  ingested_at   timestamptz not null default now()
);

-- the indexer's hot path is "everything in this time window not yet ticked"
create index if not exists events_at_idx on events (at);
create index if not exists events_untickled_idx on events (tick) where tick is null;
create index if not exists events_wallet_idx on events (wallet);

-- ---------------------------------------------------------------------------
-- the derived history
-- ---------------------------------------------------------------------------

-- one row per closed tick. this is what the world is actually rebuilt from,
-- and what a client reconciles against.
create table if not exists ticks (
  n                integer primary key,
  epoch            integer not null,
  opened_at        timestamptz not null,
  closed_at        timestamptz not null,
  net_flow_usd     numeric(20,2) not null,
  gross_volume_usd numeric(20,2) not null,
  unique_wallets   integer not null,
  largest_tx_usd   numeric(20,2) not null,
  close_price      numeric(20,10) not null default 0,
  -- the digest of this tick's own rule-visible fields, so a client can
  -- compare without fetching the whole row, and so a recompute that
  -- disagrees with what was stored is visible immediately
  digest           text not null,
  event_count      integer not null default 0
);
create index if not exists ticks_epoch_idx on ticks (epoch);

-- r1's attribution: which wallet bought how much in which tick. kept
-- separately because it is the one part of a summary that is unbounded in
-- width, and because per-wallet formations are read far less often than the
-- summary itself.
create table if not exists tick_wallets (
  n        integer not null references ticks(n) on delete cascade,
  wallet   text not null,
  buy_usd  numeric(20,2) not null default 0,
  sell_usd numeric(20,2) not null default 0,
  primary key (n, wallet)
);

-- ---------------------------------------------------------------------------
-- the world's own position
-- ---------------------------------------------------------------------------

-- a single row. GENESIS_AT IS THE MOST IMPORTANT COLUMN IN THIS SCHEMA:
-- tick numbers are derived from wall time against it rather than counted up
-- from whenever a process started, so a server that restarts lands on the
-- same tick as the one that died and a browser opened an hour later agrees
-- with both.
create table if not exists world (
  id           integer primary key default 1 check (id = 1),
  genesis_at   timestamptz not null,
  mint         text not null,
  last_tick    integer not null default 0,
  negative_run integer not null default 0,
  chain_digest text not null default '',
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- attestations: what the world says it did
-- ---------------------------------------------------------------------------

-- a work the crew finished. not derivable — the architect's design is a
-- model's answer, not a function of the log — so it is kept.
create table if not exists works (
  plan_id     text primary key,
  title       text not null,
  zone        text not null,
  slot        text not null default 'ordinary',
  epoch       integer not null,
  cells       integer not null,
  bbox        jsonb not null,
  provenance  text not null default 'claude',
  created_at  timestamptz not null default now()
);

-- the crew's journal. api/journal.js holds these in instance memory today
-- and reads them from here once this exists; nothing else about it changes.
create table if not exists journal (
  id      bigserial primary key,
  agent   text not null,
  epoch   integer not null,
  text    text not null,
  source  text not null default 'claude',
  at      timestamptz not null default now()
);
create index if not exists journal_at_idx on journal (at desc);

-- the place layer: lanterns lit, bells tolled, gravestones. a visitor's mark
-- on the world, which no amount of replaying the market will reproduce.
create table if not exists marks (
  id       bigserial primary key,
  kind     text not null,
  x        integer not null,
  y        integer not null,
  z        integer not null,
  text     text,
  visitor  text,
  at       timestamptz not null default now()
);
create index if not exists marks_at_idx on marks (at desc);

-- ---------------------------------------------------------------------------
-- access
-- ---------------------------------------------------------------------------

-- the world is public to read and writable only by the indexer's service
-- key. a visitor's browser must never be able to write a tick: the whole
-- point of moving the clock to the server is that there is one history.
alter table events       enable row level security;
alter table ticks        enable row level security;
alter table tick_wallets enable row level security;
alter table world        enable row level security;
alter table works        enable row level security;
alter table journal      enable row level security;
alter table marks        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['events','ticks','tick_wallets','world','works','journal','marks'] loop
    execute format('drop policy if exists %I on %I', t || '_public_read', t);
    execute format('create policy %I on %I for select using (true)', t || '_public_read', t);
  end loop;
end $$;
