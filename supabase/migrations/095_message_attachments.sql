-- ============================================================
-- Migration 095: Files in a conversation
--
-- A message may now carry files as well as words: drop a document into a
-- thread, add a note explaining it, send both as one message.
--
-- The files live on the message row (`attachments` JSONB) rather than in a
-- child table. `messages` is in the supabase_realtime publication, so the row
-- is what the other end receives — a child table would deliver the bubble
-- first and its files a round trip later, and every reader would need code for
-- the in-between state. One row also means the existing message policies
-- already answer "who may see this", with no second ACL to keep in step.
--
-- Blobs go to a private bucket keyed by conversation first:
--
--   {conversationId}/{senderId}/{ts}-{rand}-{fileName}
--
-- The upload happens *before* the message exists, so the storage policy cannot
-- ask about a message row. Keying on the conversation lets it ask the same
-- question the messages table asks — is the caller a participant — at a point
-- where that is the only fact available.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. The column
-- ------------------------------------------------------------

ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN messages.attachments IS
  'Files sent with this message: [{path, name, mime, size}]. path is an object key in the private message-attachments bucket.';

-- An object where an array belongs would make every reader defensive.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_attachments_is_array;
ALTER TABLE messages
  ADD CONSTRAINT messages_attachments_is_array
  CHECK (jsonb_typeof(attachments) = 'array');

-- Mirrors MAX_ATTACHMENTS_PER_MESSAGE in src/lib/chat-attachments.ts. The cap
-- is about the bubble as much as the bytes: a message is not a file manager.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_attachments_count;
ALTER TABLE messages
  ADD CONSTRAINT messages_attachments_count
  CHECK (jsonb_array_length(attachments) <= 5);

-- Attachment-only messages are legitimate (a file needs no caption), so the
-- empty-content guard has to consider both halves. NOT VALID: this only
-- describes what may be *sent* from now on, and an old row with blank content
-- is not worth failing the migration over.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_have_something_in_them;
ALTER TABLE messages
  ADD CONSTRAINT messages_have_something_in_them
  CHECK (length(btrim(content)) > 0 OR jsonb_array_length(attachments) > 0)
  NOT VALID;

-- ------------------------------------------------------------
-- 2. Reading an object key as a conversation id
--
-- `(storage.foldername(name))[1]::uuid` raises on any object whose first
-- segment is not a uuid — including objects in other buckets that the policy
-- has not filtered out yet, since Postgres does not promise AND short-circuits
-- left to right. A cast that returns NULL instead of raising keeps the policy
-- from being an error surface.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION safe_uuid(p_text TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text::UUID;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION safe_uuid(TEXT) IS
  'Cast to uuid, NULL instead of an exception. For policies that read ids out of storage object keys.';

-- ------------------------------------------------------------
-- 3. The bucket
--
-- Private. A file sent in a direct message is as private as the message, and
-- a public bucket would make its URL a permanent, unauthenticated handle on it.
-- Readers get a signed URL on demand.
-- ------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  FALSE,
  26214400, -- 25MB, same as entity-documents (048)
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Write into your own folder, inside a thread you are actually in. Both halves
-- matter: the conversation check stops a member uploading into someone else's
-- thread, the sender check stops them writing under another member's name.
DROP POLICY IF EXISTS "Participants can upload message attachments" ON storage.objects;
CREATE POLICY "Participants can upload message attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'message-attachments'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[2] = auth.uid()::TEXT
    AND is_conversation_participant(safe_uuid((storage.foldername(name))[1]), auth.uid())
  );

-- Reading is per thread, not per sender: the point of sending a file is that
-- the other participants can open it.
DROP POLICY IF EXISTS "Participants can read message attachments" ON storage.objects;
CREATE POLICY "Participants can read message attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'message-attachments'
    AND is_conversation_participant(safe_uuid((storage.foldername(name))[1]), auth.uid())
  );

-- Only the sender clears up after themselves — plus admins, who already reap
-- blobs elsewhere (093) and need to be able to act on a reported file.
DROP POLICY IF EXISTS "Senders and admins can delete message attachments" ON storage.objects;
CREATE POLICY "Senders and admins can delete message attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'message-attachments'
    AND (
      (storage.foldername(name))[2] = auth.uid()::TEXT
      OR is_oecs_admin(auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
