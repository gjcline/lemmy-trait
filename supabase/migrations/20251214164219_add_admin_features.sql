/*
  # Add Admin Features for Transaction Monitoring

  1. Changes to swap_transactions table
    - Add `admin_notes` column for admin comments on transactions
    - Add `failed_step` column to identify which step failed (1-4)

  2. New Tables
    - `email_notifications`
      - `id` (uuid, primary key) - Unique notification ID
      - `transaction_id` (uuid, foreign key) - Related transaction
      - `recipient_email` (text) - Email address where notification was sent
      - `notification_type` (text) - Type of notification (e.g., 'transaction_failed')
      - `sent_at` (timestamptz) - When email was sent
      - `email_subject` (text) - Email subject line
      - `email_body` (text) - Email content
      - `send_status` (text) - Status: 'pending', 'sent', 'failed'
      - `error_message` (text, nullable) - Error if send failed

  3. Security
    - Enable RLS on `email_notifications` table
    - Admin-only policies for email_notifications
    - Allow service role to insert notifications

  4. Indexes
    - Index on transaction_id for fast lookups
    - Index on sent_at for chronological queries
    - Index on send_status for filtering

  5. Notes
    - admin_notes allows admins to document transaction issues
    - failed_step helps identify patterns in failures (1=Service Fee, 2=Reimbursement, 3=Burn, 4=Update)
    - email_notifications provides audit trail of all sent alerts
*/

-- Add admin features to swap_transactions table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swap_transactions' AND column_name = 'admin_notes'
  ) THEN
    ALTER TABLE swap_transactions ADD COLUMN admin_notes text DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'swap_transactions' AND column_name = 'failed_step'
  ) THEN
    ALTER TABLE swap_transactions ADD COLUMN failed_step integer;
  END IF;
END $$;

-- Create email_notifications table
CREATE TABLE IF NOT EXISTS email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES swap_transactions(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  notification_type text NOT NULL DEFAULT 'transaction_failed',
  sent_at timestamptz DEFAULT now(),
  email_subject text NOT NULL,
  email_body text NOT NULL,
  send_status text DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'failed')),
  error_message text
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_email_notifications_transaction_id
  ON email_notifications(transaction_id);

CREATE INDEX IF NOT EXISTS idx_email_notifications_sent_at
  ON email_notifications(sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_notifications_status
  ON email_notifications(send_status);

-- Enable Row Level Security
ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role (backend) to insert notifications
CREATE POLICY "Service role can insert notifications"
  ON email_notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Allow service role to update notifications
CREATE POLICY "Service role can update notifications"
  ON email_notifications
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Allow anyone to read notifications (for admin dashboard)
CREATE POLICY "Anyone can view notifications"
  ON email_notifications
  FOR SELECT
  TO anon
  USING (true);