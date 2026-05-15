CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('resume', 'application', 'jobs', 'system')),
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  cta_label   text,
  cta_href    text,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own notifications" ON notifications
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX notifications_user_unread_idx ON notifications (user_id, is_read, created_at DESC);
