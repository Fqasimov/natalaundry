-- Opening a gift box, without a server.
--
-- Ported from App\Services\GiftBoxService::open(). One box per completed
-- order, fifty prizes, drawn by weight. The draw has to happen here rather
-- than in the app for the obvious reason: a client that draws its own prize
-- can draw again until it likes the answer.
--
-- The eligibility check runs INSIDE the transaction against a locked profile
-- row, which is the part that matters. GiftBoxService records why: it used to
-- check first and write after, so two taps in the same instant both read
-- "available" and both got a prize, and one completed order could pay out
-- twice. Locking the profile serialises a given customer's openings and the
-- re-check then rejects the loser.
--
-- SECURITY DEFINER, because it writes user_rewards, gift_box_openings and
-- wallet_transactions, none of which the client may write directly. It takes
-- no user id: the caller is always auth.uid(), so there is no parameter to
-- forge.

begin;

create or replace function public.open_gift_box(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user      uuid := auth.uid();
  v_order     public.orders;
  v_total     integer;
  v_roll      integer;
  v_cursor    integer := 0;
  v_reward    public.rewards;
  v_ur_id     uuid := gen_random_uuid();
  v_amount    numeric;
  v_points    integer;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Serialise this customer's openings. Everything below is a check that must
  -- not be overtaken by a second tap.
  perform 1 from public.profiles where id = v_user for update;

  select * into v_order from public.orders where id = p_order_id;

  if v_order.id is null or v_order.user_id <> v_user then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  if v_order.status <> 'completed' then
    raise exception 'order_not_completed' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.gift_box_openings
    where user_id = v_user and box_tier = 'order' and order_id = p_order_id
  ) then
    raise exception 'already_opened' using errcode = 'P0001';
  end if;

  -- Weighted draw across the active prizes, the same shape as the PHP: walk a
  -- cursor over the weights and take the first that passes the roll.
  select coalesce(sum(greatest(weight, 1)), 0) into v_total
  from public.rewards where box_tier = 'order' and active = true;

  if v_total <= 0 then
    raise exception 'no_active_rewards' using errcode = 'P0001';
  end if;

  v_roll := floor(random() * v_total)::int + 1;

  for v_reward in
    select * from public.rewards
    where box_tier = 'order' and active = true
    order by id
  loop
    v_cursor := v_cursor + greatest(v_reward.weight, 1);
    exit when v_roll <= v_cursor;
  end loop;

  insert into public.user_rewards (id, user_id, reward_id, won_at, expires_at)
  values (v_ur_id, v_user, v_reward.id, now(), now() + interval '7 days');

  insert into public.gift_box_openings
    (id, user_id, box_tier, user_reward_id, order_id, opened_at)
  values (gen_random_uuid(), v_user, 'order', v_ur_id, p_order_id, now());

  -- Balance and points land straight away; coupons and free-service prizes
  -- stay pending until they are applied to an order.
  if v_reward.kind = 'balance_bonus' then
    v_amount := (v_reward.value ->> 'amount')::numeric;
    if coalesce(v_amount, 0) > 0 then
      insert into public.wallet_transactions (user_id, amount, kind, note)
      values (v_user, v_amount, 'reward', v_reward.title);
    end if;
  elsif v_reward.kind = 'eco_points' then
    v_points := (v_reward.value ->> 'points')::int;
    if coalesce(v_points, 0) > 0 then
      update public.profiles set points = coalesce(points, 0) + v_points
      where id = v_user;
    end if;
  end if;

  return jsonb_build_object(
    'id',          v_ur_id,
    'won_at',      now(),
    'expires_at',  now() + interval '7 days',
    'reward', jsonb_build_object(
      'id',          v_reward.id,
      'kind',        v_reward.kind,
      'title',       v_reward.title,
      'description', v_reward.description,
      'value',       v_reward.value
    )
  );
end;
$$;

revoke all on function public.open_gift_box(uuid) from public, anon;
grant execute on function public.open_gift_box(uuid) to authenticated;

commit;
