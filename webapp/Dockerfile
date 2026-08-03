FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    arp-scan \
    nmap \
    iproute2 \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data

EXPOSE 28080

CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${WEBAPP_PORT:-28080}"]
