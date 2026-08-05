# Contributing to Homelab Sentinel

Thank you for your interest in contributing to **Homelab Sentinel**!

## Code of Conduct & Principles
- **Security First**: Never hardcode secrets, tokens, or private network credentials. All secrets belong in `.env` or persistent SQLite configuration.
- **Resource Efficiency**: Homelab Sentinel is optimized for Linux arm64 hardware, with Raspberry Pi 5 as the primary reference platform. Keep memory and CPU footprints minimal.
- **Zero Host Exposure**: Do not expose raw sockets or unauthenticated internal APIs directly to host ports.

## Development Workflow

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/MoayadAlshehry/homelab-sentinel.git
   cd homelab-sentinel
   ```

2. **Frontend Development (React / Vite)**:
   ```bash
   cd webapp/frontend
   npm install
   npm run dev
   ```

3. **Backend Development (FastAPI / Python 3.11)**:
   ```bash
   cd webapp
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   uvicorn main:app --reload --port 28080
   ```

4. **Testing Docker Compose Locally**:
   ```bash
   sudo docker compose -f compose/docker-compose.yml --env-file .env up -d --build
   ```

5. **Submitting Pull Requests**:
   - Ensure all commit messages are descriptive (`feat: ...`, `fix: ...`, `docs: ...`).
   - Run `gh api /repos/<owner>/homelab-sentinel/secret-scanning/alerts` to verify zero secret leaks before pushing.
   - Open a pull request against the `main` branch.
