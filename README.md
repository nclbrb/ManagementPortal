# COMELEC System

React frontend + Node.js backend (separate folders).

## Connect frontend ↔ backend

1. **Terminal A — backend** (must run first; uses port **4000**):

   ```bash
   cd backend
   npm install
   npm run dev
   ```

   You should see: `Backend running at http://localhost:4000`


2. **Terminal B — frontend** (Vite, port **5173**):

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

   Open **http://localhost:5173**

3. **Check the link**

   - Browser: [http://localhost:4000/api/health](http://localhost:4000/api/health) → should return JSON `{ "ok": true, ... }`
   - In dev, REST calls use **`/api`** (Vite proxies to port 4000). Socket.IO uses **`http://localhost:4000`** directly.

## If you see errors

| Issue | What to do |
|--------|------------|
| `Failed to fetch` / yellow banner | Backend not running — start Terminal A |
| `EADDRINUSE` port 4000 | Another backend is running — close that terminal or `taskkill` the old Node process |
| Port conflict | `set PORT=4001` in backend, then set `VITE_API_BASE_URL` and `VITE_SOCKET_URL` in `frontend/.env` to match |

## Optional env (`frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```

Leave unset in dev to use the defaults above.

## Production build

```bash
cd frontend
npm run build
```

Serve the `frontend/dist` folder with any static host; point `VITE_API_BASE_URL` / `VITE_SOCKET_URL` at your deployed API.
