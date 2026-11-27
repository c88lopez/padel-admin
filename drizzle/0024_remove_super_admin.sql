-- The Super Admin role is gone: owners work through the platform API and the database. Its sessions, accounts and (empty) memberships cascade.
DELETE FROM "user" WHERE "role" = 'Super Admin';
