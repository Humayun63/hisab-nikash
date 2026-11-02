-- Removes everything created by seed.sql (and by tests) for *@e2e.hisab-nikash.test users.
-- Deleting an organization cascades to its profiles, spaces, folders, files, categories and entries.
delete from public.organizations
where owner_id in (select id from auth.users where email like '%@e2e.hisab-nikash.test');

delete from auth.users where email like '%@e2e.hisab-nikash.test';
