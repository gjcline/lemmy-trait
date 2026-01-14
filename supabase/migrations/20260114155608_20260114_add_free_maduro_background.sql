/*
  # Add Free Maduro Background with Wallet Claim Limits

  ## Overview
  This migration adds support for free trait claims with per-wallet limits and introduces the Maduro background as a free limited-edition item.

  ## 1. Schema Changes

  ### `shop_traits` table modifications:
  - Add `max_claims_per_wallet` (integer, nullable) - Limits how many times a single wallet can claim this item
  - Drop and recreate constraints to allow zero values for `burn_cost` and `sol_price` (for free items)

  ### `trait_purchases` table modifications:
  - Update payment_method constraint to allow 'free' in addition to 'burn' and 'sol'

  ## 2. New Functions

  ### `get_wallet_claim_count()`
  Returns the number of completed claims a specific wallet has made for a specific trait.

  ### `can_wallet_claim_trait()`
  Validates if a wallet is allowed to claim a trait based on max_claims_per_wallet limit.
  Returns true if:
  - The trait has no claim limit (max_claims_per_wallet IS NULL), OR
  - The wallet's completed claims are less than the limit

  ## 3. New Data

  ### Maduro Background Trait
  - Name: "Maduro Background"
  - Category: "Background"
  - Trait Value: "Maduro"
  - Cost: FREE (0 burn, 0 SOL)
  - Stock: 20 total units
  - Max Claims Per Wallet: 5
  - Status: Active

  ## 4. Security
  - Claim count validation prevents abuse
  - Stock quantity still enforced (20 total)
  - Per-wallet limit prevents hoarding (5 per wallet max)

  ## 5. Notes
  - Free items require no payment from users
  - Metadata update fees still covered by 2U reimbursement wallet
  - max_claims_per_wallet is optional and only applies when set
  - Other traits unaffected by this feature unless explicitly configured
*/

-- Add max_claims_per_wallet column to shop_traits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shop_traits' AND column_name = 'max_claims_per_wallet'
  ) THEN
    ALTER TABLE shop_traits ADD COLUMN max_claims_per_wallet integer CHECK (max_claims_per_wallet IS NULL OR max_claims_per_wallet > 0);
  END IF;
END $$;

-- Drop and recreate constraints to allow zero values for free items
ALTER TABLE shop_traits DROP CONSTRAINT IF EXISTS shop_traits_burn_cost_check;
ALTER TABLE shop_traits ADD CONSTRAINT shop_traits_burn_cost_check CHECK (burn_cost >= 0);

ALTER TABLE shop_traits DROP CONSTRAINT IF EXISTS shop_traits_sol_price_check;
ALTER TABLE shop_traits ADD CONSTRAINT shop_traits_sol_price_check CHECK (sol_price >= 0);

-- Update trait_purchases payment_method to allow 'free'
ALTER TABLE trait_purchases DROP CONSTRAINT IF EXISTS trait_purchases_payment_method_check;
ALTER TABLE trait_purchases ADD CONSTRAINT trait_purchases_payment_method_check
  CHECK (payment_method IN ('burn', 'sol', 'free'));

-- Function to get wallet claim count for a specific trait
CREATE OR REPLACE FUNCTION get_wallet_claim_count(
  p_wallet_address text,
  p_trait_id uuid
)
RETURNS integer AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::integer
    FROM trait_purchases
    WHERE wallet_address = p_wallet_address
      AND trait_id = p_trait_id
      AND status = 'completed'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if wallet can claim a trait
CREATE OR REPLACE FUNCTION can_wallet_claim_trait(
  p_wallet_address text,
  p_trait_id uuid
)
RETURNS TABLE(
  can_claim boolean,
  claims_used integer,
  max_claims integer,
  claims_remaining integer
) AS $$
DECLARE
  v_max_claims integer;
  v_claims_used integer;
BEGIN
  -- Get the max claims limit for this trait
  SELECT max_claims_per_wallet INTO v_max_claims
  FROM shop_traits
  WHERE id = p_trait_id;

  -- Get current claim count for this wallet
  v_claims_used := get_wallet_claim_count(p_wallet_address, p_trait_id);

  -- If no limit is set, wallet can claim (unlimited)
  IF v_max_claims IS NULL THEN
    RETURN QUERY SELECT true, v_claims_used, NULL::integer, NULL::integer;
  -- If wallet hasn't reached limit, they can claim
  ELSIF v_claims_used < v_max_claims THEN
    RETURN QUERY SELECT true, v_claims_used, v_max_claims, (v_max_claims - v_claims_used);
  -- Wallet has reached limit
  ELSE
    RETURN QUERY SELECT false, v_claims_used, v_max_claims, 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert Maduro Background trait (only if it doesn't already exist)
INSERT INTO shop_traits (
  name,
  category,
  trait_value,
  image_url,
  burn_cost,
  sol_price,
  stock_quantity,
  max_claims_per_wallet,
  is_active
)
SELECT
  'Maduro Background',
  'Background',
  'Maduro',
  'https://trapstars-assets.netlify.app/background/madurobg.png',
  0,
  0.0,
  20,
  5,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM shop_traits WHERE name = 'Maduro Background'
);

-- Create index for faster wallet claim lookups
CREATE INDEX IF NOT EXISTS idx_trait_purchases_wallet_trait
  ON trait_purchases(wallet_address, trait_id, status);
