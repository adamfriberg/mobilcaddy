# Mobilcaddy

Mobil caddy-app: GPS-avstånd, scorekort, klubbregister och statistik.
Adam, hcp 11, Jönköpings GK.

## Fas 1 — grundstruktur
- `server/` — Node.js/Express API med hälsokontroll (`/api/health`) och DB-anslutning
- `server/migrations/001_init.sql` — grundschema (users, courses, holes, clubs, rounds, hole_scores, shots, goals)
- `docker-compose.yml` — api + postgres + caddy (automatisk HTTPS)
- `caddy/Caddyfile` — reverse proxy mot `78-47-168-243.sslip.io`

## Deploy
Se driftinstruktioner i projektchatten. I korthet:
```
docker compose up -d --build
docker compose exec api npm run migrate
```
