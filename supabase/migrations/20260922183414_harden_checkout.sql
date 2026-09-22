-- ============================================================
-- Harden checkout / PayFast finalization
-- ============================================================

create or replace function public.finalize_paid_order(
  p_order_id uuid,
  p_provider_reference text,
  p_amount numeric,
  p_raw_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order orders%rowtype;
  v_item record;
  v_inventory inventory%rowtype;
begin
  -- Lock the order so the same payment cannot be finalized twice
  -- concurrently.
  select *
  into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  -- The amount PayFast reports must match the amount we originally
  -- created for the order.
  if abs(p_amount - v_order.total) > 0.01 then
    raise exception 'Payment amount does not match order total';
  end if;

  -- If this order has already been paid, make the operation
  -- idempotent.
  if v_order.status = 'paid'
     or v_order.status = 'processing'
     or v_order.status = 'shipped'
     or v_order.status = 'delivered' then

    update payments
    set
      provider_reference = p_provider_reference,
      raw_payload = p_raw_payload,
      status = 'paid',
      updated_at = now()
    where order_id = p_order_id;

    return;
  end if;

  -- Only pending payments may transition to paid.
  if v_order.status <> 'pending_payment' then
    raise exception 'Order is not awaiting payment';
  end if;

  -- Lock every inventory row before checking/decrementing it.
  for v_item in
    select product_id, quantity
    from order_items
    where order_id = p_order_id
    order by product_id
  loop

    if v_item.product_id is null then
      continue;
    end if;

    select *
    into v_inventory
    from inventory
    where product_id = v_item.product_id
    for update;

    if not found then
      raise exception 'Inventory record not found for product %',
        v_item.product_id;
    end if;

    if v_inventory.quantity < v_item.quantity then
      raise exception 'Insufficient stock for product %',
        v_item.product_id;
    end if;

    update inventory
    set
      quantity = quantity - v_item.quantity,
      updated_at = now()
    where product_id = v_item.product_id;
  end loop;

  -- Payment is now confirmed and stock has been safely deducted.
  update payments
  set
    status = 'paid',
    provider_reference = p_provider_reference,
    raw_payload = p_raw_payload,
    updated_at = now()
  where order_id = p_order_id;

  update orders
  set
    status = 'paid',
    updated_at = now()
  where id = p_order_id;

  -- Now that payment is confirmed, remove the purchased items
  -- from the customer's cart.
  delete from cart_items
  where cart_id in (
    select id
    from carts
    where user_id = v_order.user_id
  );

end;
$$;

revoke all on function public.finalize_paid_order(
  uuid,
  text,
  numeric,
  jsonb
) from public;

grant execute on function public.finalize_paid_order(
  uuid,
  text,
  numeric,
  jsonb
) to service_role;