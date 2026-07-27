-- ============================================================
-- Migration 028: Profiles DELETE policy
-- 000_create_profiles_table.sql only ever granted SELECT/INSERT/UPDATE
-- on `profiles` — there is no DELETE policy, so
-- AuthContext.tsx's deleteAccount() (`supabase.from('profiles').delete()
-- .eq('id', user.id)`) silently deletes 0 rows under RLS (no error is
-- raised by PostgREST; the row simply isn't visible to delete).
-- Idempotent — safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS "Users can delete their own profile" ON profiles;
CREATE POLICY "Users can delete their own profile"
  ON profiles FOR DELETE
  USING (auth.uid() = id);

-- NOTE: This only fixes the `profiles` row deletion. AuthContext.deleteAccount()
-- calls supabase.auth.signOut() afterward but never deletes the underlying
-- auth.users row — the Supabase client has no privilege to do that (auth
-- admin operations require the service_role key, which must never ship to
-- the browser). The auth.users row — and anything still FK'd to
-- profiles(id) that isn't ON DELETE CASCADE — will remain orphaned.
-- Deleting the auth.users record requires either:
--   (a) a Supabase Edge Function (using the service role key) that calls
--       supabase.auth.admin.deleteUser(userId), invoked from the client
--       via supabase.functions.invoke(...), or
--   (b) a scheduled/manual admin cleanup job.
-- No such function is created here — src changes and edge functions are
-- out of scope for this migration.
