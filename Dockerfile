FROM oven/bun:latest

RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ADD https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux /usr/local/bin/yt-dlp
RUN chmod a+rx /usr/local/bin/yt-dlp

RUN mkdir -p /app && chown bun:bun /app
WORKDIR /app

ENV HF_HOME=/app/.cache/huggingface
ENV XDG_CACHE_HOME=/app/.cache

USER bun
COPY --chown=bun:bun package*.json bun.lock* ./
RUN bun install
COPY --chown=bun:bun . .

CMD ["sleep", "infinity"]