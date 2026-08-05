FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    arp-scan \
    nmap \
    iproute2 \
    procps \
    && mkdir -p /usr/share/arp-scan \
    && (wget -q -O /usr/share/arp-scan/ieee-oui.txt https://raw.githubusercontent.com/royhills/arp-scan/master/ieee-oui.txt || touch /usr/share/arp-scan/ieee-oui.txt) \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY main.py .
COPY --from=frontend-builder /app/frontend/dist /app/static

RUN mkdir -p /app/data

EXPOSE 28080

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${WEBAPP_PORT:-28080}"]
