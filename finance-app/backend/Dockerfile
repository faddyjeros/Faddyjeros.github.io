FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /data /app/localdata && chmod +x docker-entrypoint.sh

CMD ["/app/docker-entrypoint.sh"]
