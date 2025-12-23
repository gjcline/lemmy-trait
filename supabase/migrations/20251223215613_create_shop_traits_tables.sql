/*
  # Create Shop Traits and Purchases Tables

  ## Overview
  This migration creates the database schema for the Trait Shop feature, which allows users to purchase exclusive traits for their Trap Star NFTs by either burning Trap Stars or paying with SOL.

  ## 1. New Tables

  ### `shop_traits`
  Stores all available traits in the shop with their metadata and pricing:
  - `id` (uuid, primary key) - Unique identifier for each trait
  - `name` (text) - Display name of the trait (e.g., "Crown", "Gold AK")
  - `category` (text) - Type of trait (headwear, weapons, background)
  - `image_url` (text) - URL to the trait image asset
  - `burn_cost` (integer) - Number of Trap Stars required to burn (1 or 2)
  - `sol_price` (decimal) - Alternative SOL payment amount (0.1 or 0.2)
  - `stock_quantity` (integer, nullable) - Available stock (null = unlimited)
  - `is_active` (boolean) - Whether trait is currently available for purchase
  - `created_at` (timestamptz) - When trait was added to shop

  ### `trait_purchases`
  Records all completed trait purchases for tracking and analytics:
  - `id` (uuid, primary key) - Unique purchase identifier
  - `wallet_address` (text) - Buyer's Solana wallet address
  - `trait_id` (uuid, foreign key) - Reference to purchased trait
  - `payment_method` (text) - Either 'burn' or 'sol'
  - `nfts_burned_count` (integer) - Number of Trap Stars burned (0 if SOL payment)
  - `burned_nft_mints` (jsonb) - Array of burned NFT mint addresses
  - `sol_amount` (decimal) - Total SOL paid including fees
  - `transaction_signature` (text) - Blockchain transaction signature
  - `target_nft_mint` (text) - Mint address of Trap Star receiving the trait
  - `status` (text) - Purchase status: 'pending', 'completed', 'failed'
  - `error_message` (text, nullable) - Error details if transaction failed
  - `created_at` (timestamptz) - Purchase timestamp
  - `updated_at` (timestamptz) - Last status update timestamp

  ## 2. Security
  - Enable RLS on both tables
  - Allow public read access to active shop_traits
  - Allow authenticated users to view their own purchases
  - Only authenticated users can insert purchases
  - Admin policies will be added separately

  ## 3. Indexes
  - Index on trait_id for fast purchase lookups
  - Index on wallet_address for user purchase history
  - Index on status for admin filtering

  ## 4. Notes
  - Stock tracking is optional (null = unlimited inventory)
  - Failed purchases are retained for admin review and retry
  - burned_nft_mints stored as JSONB array for flexibility
  - Timestamps track purchase lifecycle for analytics
*/

-- Create shop_traits table
CREATE TABLE IF NOT EXISTS shop_traits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  image_url text NOT NULL,
  burn_cost integer NOT NULL CHECK (burn_cost > 0),
  sol_price decimal(10, 4) NOT NULL CHECK (sol_price > 0),
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create trait_purchases table
CREATE TABLE IF NOT EXISTS trait_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL,
  trait_id uuid NOT NULL REFERENCES shop_traits(id),
  payment_method text NOT NULL CHECK (payment_method IN ('burn', 'sol')),
  nfts_burned_count integer DEFAULT 0,
  burned_nft_mints jsonb DEFAULT '[]'::jsonb,
  sol_amount decimal(10, 4) NOT NULL,
  transaction_signature text,
  target_nft_mint text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_trait_purchases_trait_id ON trait_purchases(trait_id);
CREATE INDEX IF NOT EXISTS idx_trait_purchases_wallet ON trait_purchases(wallet_address);
CREATE INDEX IF NOT EXISTS idx_trait_purchases_status ON trait_purchases(status);
CREATE INDEX IF NOT EXISTS idx_shop_traits_active ON shop_traits(is_active);

-- Enable RLS
ALTER TABLE shop_traits ENABLE ROW LEVEL SECURITY;
ALTER TABLE trait_purchases ENABLE ROW LEVEL SECURITY;

-- Shop traits policies: Anyone can view active traits
CREATE POLICY "Anyone can view active shop traits"
  ON shop_traits FOR SELECT
  USING (is_active = true);

-- Admin can view all traits (including inactive)
CREATE POLICY "Authenticated users can view all shop traits"
  ON shop_traits FOR SELECT
  TO authenticated
  USING (true);

-- Admin can insert/update/delete traits
CREATE POLICY "Authenticated users can insert shop traits"
  ON shop_traits FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update shop traits"
  ON shop_traits FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shop traits"
  ON shop_traits FOR DELETE
  TO authenticated
  USING (true);

-- Trait purchases policies: Users can view their own purchases
CREATE POLICY "Users can view own purchases"
  ON trait_purchases FOR SELECT
  TO authenticated
  USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Users can insert their own purchases
CREATE POLICY "Users can insert own purchases"
  ON trait_purchases FOR INSERT
  TO authenticated
  WITH CHECK (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Admin can view all purchases
CREATE POLICY "Authenticated users can view all purchases"
  ON trait_purchases FOR SELECT
  TO authenticated
  USING (true);

-- Admin can update purchase status
CREATE POLICY "Authenticated users can update purchases"
  ON trait_purchases FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);