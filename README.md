# FlipOps 🔁

> A full-stack Wallapop flipping operations dashboard — search deals, negotiate, generate listings, and track your P&L.

**Live app**: [https://rom946.github.io/FlipOps/](https://rom946.github.io/FlipOps/)

**Tech Stack**: React (Vite) + Tailwind CSS frontend · Python Flask backend · Anthropic Claude AI

---

## Project Structure

```
flipops/
├── frontend/        # Vite + React (deployed to GitHub Pages)
├── backend/         # Flask API server (deploy to Render)
├── .github/
│   └── workflows/
│       └── deploy.yml
└── README.md
```

## Local Development

### Prerequisites
- **Node.js** 18+ (for frontend)
- **Python** 3.11+ (for backend)
- **Anthropic API key** (get one at https://console.anthropic.com)

### 1 — Backend (Flask)

```bash
cd backend

# Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Copy env file and fill in your key
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux

# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# Start the Flask dev server
python app.py
# Server runs at http://localhost:5000
```

### 2 — Frontend (React)

```bash
cd frontend

# Install dependencies
npm install

# Copy env file
copy .env.example .env        # Windows
# cp .env.example .env        # macOS/Linux

# Edit .env — VITE_API_URL should point to Flask:
# VITE_API_URL=http://localhost:5000

# (In dev, the Vite proxy already forwards /api to :5000 automatically)
npm run dev
# App runs at http://localhost:3000
```

---

## Environment Variables

### `backend/.env`

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (required for AI features) |
| `FLASK_ENV` | `development` for debug mode |
| `PORT` | Port to run Flask on (default: 5000) |

### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_API_URL` | URL of the Flask backend (empty string = use Vite proxy in dev; set to full URL in production) |

---

## Deploying Backend to Render (Free Tier)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo
4. Set **Root Directory** to `backend`
5. **Build Command**: `pip install -r requirements.txt`
6. **Start Command**: `gunicorn app:app`
7. Add **Environment Variables**:
   - `ANTHROPIC_API_KEY` = your key
8. Deploy! Copy the Render URL (e.g. `https://flipops-api.onrender.com`)

---

## Deploying Frontend to GitHub Pages

1. In your GitHub repo → **Settings → Secrets and Variables → Actions**
2. Add secret: `VITE_API_URL` = your Render backend URL (e.g. `https://flipops-api.onrender.com`)
3. Push to `main` — GitHub Actions will automatically build and deploy
4. Enable GitHub Pages: **Settings → Pages → Source: Deploy from branch → gh-pages**
5. Your app will be live at `https://<username>.github.io/FlipOps/`

---

## Features

| View | What it does |
|---|---|
| 🔍 **Search** | Proxy search to Wallapop API, AI score deals |
| 💬 **Negotiate** | Generate Spanish negotiation messages via Claude |
| 🏷️ **Listing** | AI-generated Wallapop listings with P&L preview |
| 📋 **Pipeline** | Kanban table of all deals, localStorage persisted |
| 📊 **P&L Dashboard** | Metrics + Chart.js bar chart of profits |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/search` | Search Wallapop listings |
| POST | `/api/score-deals` | AI score search results |
| POST | `/api/negotiate` | Generate negotiation message |
| POST | `/api/generate-listing` | Generate Wallapop listing |
| GET | `/api/health` | Health check |

---

## License

MIT
