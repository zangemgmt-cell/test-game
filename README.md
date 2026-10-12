# The Shattered Concord — Milestone 1

A small, persistent browser RPG foundation. It uses only Node.js built-ins and requires no package installation.

## Run locally

Use Node.js 22.13 or newer. From this directory:

    node server.mjs

Open http://localhost:3000. Create an account, then create a character. Additional accounts on the same running server use the same world and database.

## Public demo deployment

`render.yaml` defines a Render Free web service for a shareable demo. Render deploys Blueprints from a connected Git repository. The SQLite file is stored on the service's temporary filesystem, so accounts and game state can be lost when Render restarts or redeploys the service. Render assigns the public `onrender.com` address after the first successful deploy; the localhost address above is only for local development.

The Free service costs $0/month, but it spins down after inactivity and does not support persistent disks. This is suitable for trying the demo, not for preserving a long-term shared world. A persistent public service requires paid storage or a managed database.

This is an early, single-server demo using SQLite. It is not ready for a large public population or horizontal scaling. A production multiplayer launch still needs PostgreSQL, operational monitoring, verified account recovery, and tested backup/restore procedures.

## Automated checks

Run the Milestone 1 automated check with:

    node --test

It covers registration and login, character persistence, shared public profiles, unauthorized writes, atomic purchase and replay handling, and database state after reopening the file.

The server binds to 127.0.0.1 by default. Set PORT or HOST before starting if your local setup needs a different address. GAME_DB_PATH can point at another SQLite file.

## Included

- Account registration/login with scrypt password hashes and server-side sessions.
- Character creation with ancestry, background, discipline, and server-calculated starting attributes.
- A shared seeded world map and public adventurer directory.
- Server-persisted crowns and inventory, including an atomic Greywatch vendor purchase.
- Responsive overview, character, inventory, market, and world screens.
- Same-origin mutation checks, input validation, auth rate limits, secure cookie options, action idempotency, SQLite transactions, and basic security headers.

## Local development security

This is a development foundation, not a public production deployment. The database is SQLite and the server is a single Node process. It is appropriate for local development and small demonstrations; it is not the planned production database for a growing multiplayer service. Before a production launch, migrate to PostgreSQL, add verified email/account recovery and operational monitoring, review rate limits behind the chosen proxy, and exercise backup/restore procedures. Set SECURE_COOKIES=1 when HTTPS terminates at the application server or trusted proxy.

The app intentionally has no cross-origin API access. Browser writes must carry a matching Origin header. Do not expose this local server directly to the public internet.

See [BACKUP.md](BACKUP.md) for the local SQLite backup and recovery procedure.

## Milestone 1 boundaries

World travel, contracts, combat, equipment effects, crafting, PvP, organizations, settlements, and armies are not implemented yet. The UI identifies these as later systems rather than presenting nonfunctional controls. The shared region data and domain records are the foundation for those milestones.
