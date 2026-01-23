/*
  Security Fixes and RLS Optimization

  1. RLS Performance Optimization
     - Fix policies using auth.uid() directly (causes per-row evaluation)
     - Replace with (select auth.uid()) for per-query evaluation

  2. Overly Permissive RLS Policies
     - Fix shop_traits policies that allow unrestricted access
     - Remove duplicate overlapping policies

  3. Function Search Path Security
     - Add SET search_path to SECURITY DEFINER functions
*/

-- ==============================================================================
-- STEP 1: Fix RLS Performance Issues
-- ==============================================================================

DROP POLICY IF EXISTS "Users can view own swap transactions" ON swap_transactions;

CREATE POLICY "Users can view own swap transactions"
  ON swap_transactions FOR SELECT
  TO anon, authenticated
  USING (wallet_address = (SELECT current_setting('request.jwt.claims', true)::json->>'wallet_address'));

DROP POLICY IF EXISTS "Users can view own purchases" ON trait_purchases;

CREATE POLICY "Users can view own purchases"
  ON trait_purchases FOR SELECT
  TO authenticated
  USING (wallet_address = (SELECT current_setting('request.jwt.claims', true)::json->>'wallet_address'));

-- ==============================================================================
-- STEP 2: Fix Overly Permissive RLS Policies
-- ==============================================================================

DROP POLICY IF EXISTS "Authenticated users can insert shop traits" ON shop_traits;
DROP POLICY IF EXISTS "Authenticated users can update shop traits" ON shop_traits;
DROP POLICY IF EXISTS "Authenticated users can delete shop traits" ON shop_traits;
DROP POLICY IF EXISTS "Authenticated users can view all shop traits" ON shop_traits;
DROP POLICY IF EXISTS "Authenticated users can view all purchases" ON trait_purchases;
DROP POLICY IF EXISTS "Authenticated users can update purchases" ON trait_purchases;

-- ==============================================================================
-- STEP 3: Fix Function Search Path Security
-- ==============================================================================

DROP FUNCTION IF EXISTS get_wallet_claim_count(text, uuid);
CREATE FUNCTION get_wallet_claim_count(
  p_wallet_address text,
  p_trait_id uuid
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claim_count bigint;
BEGIN
  SELECT COUNT(*)
  INTO claim_count
  FROM trait_purchases
  WHERE wallet_address = p_wallet_address
    AND trait_id = p_trait_id
    AND status = 'completed';

  RETURN claim_count;
END;
$$;

DROP FUNCTION IF EXISTS check_trait_stock(uuid);
CREATE FUNCTION check_trait_stock(trait_uuid uuid)
RETURNS TABLE(
  trait_id uuid,
  trait_name text,
  stock_quantity integer,
  available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    st.id,
    st.name,
    st.stock_quantity,
    CASE
      WHEN st.stock_quantity IS NULL THEN true
      WHEN st.stock_quantity > 0 THEN true
      ELSE false
    END as available
  FROM shop_traits st
  WHERE st.id = trait_uuid;
END;
$$;

DROP FUNCTION IF EXISTS can_wallet_claim_trait(text, uuid);
CREATE FUNCTION can_wallet_claim_trait(
  p_wallet_address text,
  p_trait_id uuid
)
RETURNS TABLE(
  can_claim boolean,
  claims_used bigint,
  max_claims integer,
  claims_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_claims integer;
  v_claims_used bigint;
BEGIN
  SELECT max_claims_per_wallet
  INTO v_max_claims
  FROM shop_traits
  WHERE id = p_trait_id;

  IF v_max_claims IS NULL THEN
    RETURN QUERY SELECT true, 0::bigint, 0, 0;
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_claims_used
  FROM trait_purchases
  WHERE wallet_address = p_wallet_address
    AND trait_id = p_trait_id
    AND status = 'completed';

  RETURN QUERY SELECT
    (v_claims_used < v_max_claims),
    v_claims_used,
    v_max_claims,
    GREATEST(0, v_max_claims - v_claims_used::integer);
END;
$$;

-- ==============================================================================
-- STEP 4: Add documentation
-- ==============================================================================

COMMENT ON POLICY "Anyone can insert purchases" ON trait_purchases IS
  'Intentionally permissive: Required for stock reservation system.';

COMMENT ON POLICY "Anyone can insert transaction logs" ON transaction_logs IS
  'Intentionally permissive: Required for client-side error tracking.';

COMMENT ON VIEW admin_transaction_overview IS
  'SECURITY DEFINER: Required for admin dashboard. Admin access controlled at application layer.';

COMMENT ON VIEW shop_inventory_status IS
  'SECURITY DEFINER: Required for public inventory display.';