# Supabase Setup Instructions

## Step 1: Authenticate with Supabase CLI

Run this command to authenticate:

```bash
npx supabase login
```

This will:
- Open a browser window asking for authentication
- Generate an access token
- Save it locally

## Step 2: Link Your Project

Link your Supabase project using the project ref from `.env.local`:

```bash
npx supabase link --project-ref jviynrkylpdijxpdemxv
```

Replace `jviynrkylpdijxpdemxv` with your actual project ref if different.

You'll be prompted to confirm linking to your project.

## Step 3: Push Migrations to Database

Apply all migrations to your Supabase database:

```bash
npx supabase db push
```

This will:
- Execute `supabase/migrations/001_initial_schema.sql`
- Create all 19 tables
- Set up indexes, functions, triggers, and RLS policies
- Seed demo data if seeds exist

## Expected Output

```
Created table "workspaces"
Created table "users"
Created table "workspace_users"
Created table "agents"
...
19 tables created
RLS policies enabled
Migrations applied successfully ✓
```

## Verification

After successful push, verify your database:

```bash
# Pull current database state
npx supabase db pull

# Check schema
npx supabase db list tables
```

## Troubleshooting

### "Access denied" during link

- Ensure you have access to this Supabase project
- Check that the project ref is correct
- Run `npx supabase logout` and login again

### "Migration already applied"

- This is normal if you've already pushed
- To reset (WARNING: deletes all data):
  ```bash
  npx supabase db reset
  ```

### "pgvector extension not found"

- Your Supabase project needs the pgvector extension
- This should be auto-created by the migration
- If not, enable it manually in Supabase dashboard:
  - SQL Editor → Create Custom Query
  - Run: `CREATE EXTENSION IF NOT EXISTS "vector";`

## Next Steps

Once migrations are applied:

1. Fill in remaining `.env.local` values (ANTHROPIC_MODEL, API keys)
2. Run the application: `npm run dev`
3. Navigate to http://localhost:3000
4. Create your first workspace
5. Test the support agent

## Security Note

Never commit `.env.local` — it contains sensitive credentials.
The `.gitignore` file already protects it.

---

**Status**: Ready for setup
**Project Ref**: `jviynrkylpdijxpdemxv`
**Database URL**: `https://jviynrkylpdijxpdemxv.supabase.co`
