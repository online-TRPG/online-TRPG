# Guest Account Retention

Guest accounts are temporary. Users who want to keep characters, sessions, and scenarios should save the guest account as a local member account from the account page.

## Policy

- Guest accounts older than 7 days are eligible for hard deletion.
- Member accounts continue to use soft delete through `deletedAt`.
- Scenarios created by deleted guests remain, but `createdByUserId` becomes `null`.
- Sessions hosted by expired guests are deleted with their dependent session data.

## Commands

Dry run:

```bash
npm run cleanup:guests
```

Apply deletion:

```bash
npm run cleanup:guests:apply
```

Custom retention window:

```bash
npm run cleanup:guests -- --days=14
npm run cleanup:guests:apply -- --days=14
```

Run `cleanup:guests:apply` from the production scheduler once per day.
