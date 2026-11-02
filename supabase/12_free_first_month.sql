-- New restaurants pay no Relax&Bite fee for their first 30 days after approval.
-- vendors.approved_at records when the store was first approved.
-- Run once in Supabase > SQL Editor > New query. Safe to run again.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'vendors' and column_name = 'approved_at') then
    alter table vendors add column approved_at timestamptz;
    -- Stores already approved count from the day they joined
    update vendors set approved_at = created_at where status = 'approved';
  end if;
end $$;

notify pgrst, 'reload schema';
