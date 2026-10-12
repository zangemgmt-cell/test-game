# Local database backup and recovery

This procedure is for the local SQLite development database. Keep backups outside the project’s data directory.

## Create a backup

1. Stop the game server with Ctrl+C and wait for the process to exit. The server closes SQLite cleanly on shutdown.
2. Copy data/shattered-concord.sqlite to a dated backup location, for example:
   
       Copy-Item .\data\shattered-concord.sqlite C:\game-backups\shattered-concord-2026-10-12.sqlite

3. Keep more than one dated copy if the world matters. The app does not yet automate backup retention.

## Restore a backup

1. Stop the game server.
2. Preserve the current database file elsewhere if it may be needed for investigation.
3. Copy the chosen backup to data/shattered-concord.sqlite (or the path configured by GAME_DB_PATH).
4. Start the server and sign in with an account that existed at the backup time.

Do not copy the database while the server is actively writing to it. This simple procedure depends on a clean shutdown. Before public launch, replace it with a tested PostgreSQL backup schedule and a restore exercise in a separate environment.
