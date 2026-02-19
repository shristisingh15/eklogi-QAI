# testflow
This project demonstrates AI-assisted generation of test flows from uploaded product/requirements documents.

## Local setup (no code edits required)

1. Backend setup
```bash
cd /Users/shristisingh/Documents/eklogi.qai/eklogi-QAI-main/backend
cp .env.example .env
npm install
npm run dev
```

2. Frontend setup
```bash
cd /Users/shristisingh/Documents/eklogi.qai/eklogi-QAI-main/frontend
cp .env.example .env
npm install
npm run dev
```

## Local defaults
- Frontend API base defaults to `http://localhost:5004`.
- Backend defaults to port `5004`.
- Update only `.env` files when needed, not source code.
