-- The gift box could never load: the reward tables have no foreign keys.
--
-- fetchGiftBoxes() asks PostgREST for
--
--   user_rewards -> select id, won_at, ..., rewards(id, kind, title, ...)
--
-- and PostgREST resolves an embedded relation like `rewards(...)` purely from
-- foreign keys. There were none — not one FK on user_rewards,
-- gift_box_openings or rewards — so the request came back PGRST200 "Could not
-- find a relationship", the screen treated it as a failure to reach the
-- server, and the box never opened.
--
-- The tables were created by the Laravel reward migration, which declared the
-- columns but not the constraints. Both reward tables are empty, so adding the
-- keys now cannot fail on existing data; `rewards` has its 50 seeded prizes and
-- is only ever referenced, never referencing.
--
-- These earn their keep twice: PostgREST needs them to embed, and they stop a
-- user_reward pointing at a prize that no longer exists.

begin;

-- user_rewards.reward_id -> rewards.id
--
-- RESTRICT rather than CASCADE: deleting a prize from the pool must not
-- silently delete the record that someone won it. Retiring a prize is what
-- `rewards.active = false` is for.
alter table public.user_rewards
  drop constraint if exists user_rewards_reward_id_fkey,
  add constraint user_rewards_reward_id_fkey
    foreign key (reward_id) references public.rewards (id) on delete restrict;

-- user_rewards.user_id -> profiles.id
--
-- CASCADE here: if the profile goes, the winnings attached to it are
-- meaningless. profiles.id is itself auth.users.id.
alter table public.user_rewards
  drop constraint if exists user_rewards_user_id_fkey,
  add constraint user_rewards_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

-- user_rewards.used_on_order_id -> orders.id (nullable: unused rewards have none)
alter table public.user_rewards
  drop constraint if exists user_rewards_used_on_order_id_fkey,
  add constraint user_rewards_used_on_order_id_fkey
    foreign key (used_on_order_id) references public.orders (id) on delete set null;

alter table public.gift_box_openings
  drop constraint if exists gift_box_openings_user_id_fkey,
  add constraint gift_box_openings_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.gift_box_openings
  drop constraint if exists gift_box_openings_user_reward_id_fkey,
  add constraint gift_box_openings_user_reward_id_fkey
    foreign key (user_reward_id) references public.user_rewards (id) on delete set null;

-- An opening is tied to the order that earned it. If the order goes, so does
-- the record of the box it unlocked.
alter table public.gift_box_openings
  drop constraint if exists gift_box_openings_order_id_fkey,
  add constraint gift_box_openings_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade;

commit;

-- PostgREST caches the schema, including the relationships it can embed. It
-- will keep answering PGRST200 until told to look again.
notify pgrst, 'reload schema';
