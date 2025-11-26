/*
  # Add Fee Tracking to Swap Transactions

  1. Changes
    - Add `service_fee_signature` column to track payment to fee recipient wallet
    - Add `reimbursement_signature` column to track payment to update authority wallet
    - Add `service_fee_amount` column to track service fee (default 0.025 SOL)
    - Add `reimbursement_amount` column to track blockchain cost reimbursement
    - Add `total_paid_by_user` column to track total amount paid by user

  2. Notes
    - Service fee is paid by user to fee recipient wallet before swap begins
    - Reimbursement is paid by user to update authority wallet to cover blockchain costs
    - Both transactions must succeed before burn and swap proceeds
    - These signatures provide complete audit trail of all payments
*/

-- Add fee tracking columns to swap_transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swap_transactions' AND column_name = 'service_fee_signature'
  ) THEN
    ALTER TABLE swap_transactions ADD COLUMN service_fee_signature text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swap_transactions' AND column_name = 'reimbursement_signature'
  ) THEN
    ALTER TABLE swap_transactions ADD COLUMN reimbursement_signature text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swap_transactions' AND column_name = 'service_fee_amount'
  ) THEN
    ALTER TABLE swap_transactions ADD COLUMN service_fee_amount numeric DEFAULT 0.025;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swap_transactions' AND column_name = 'reimbursement_amount'
  ) THEN
    ALTER TABLE swap_transactions ADD COLUMN reimbursement_amount numeric DEFAULT 0.015;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swap_transactions' AND column_name = 'total_paid_by_user'
  ) THEN
    ALTER TABLE swap_transactions ADD COLUMN total_paid_by_user numeric DEFAULT 0.040;
  END IF;
END $$;